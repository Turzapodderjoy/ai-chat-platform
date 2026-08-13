import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderKey,
} from "@ai-chat-platform/types";
import {
  AllProvidersFailedError,
  InvalidApiKeyError,
  ProviderUnavailableError,
  RateLimitedError,
} from "./errors";
import { HealthTracker } from "./health-tracker";
import { KeyManager } from "./key-manager";
import { retryWithBackoff } from "./retry";
import { UsageTracker, type ProviderUsage } from "./usage-tracker";

interface AIManagerOptions {
  failoverOrder?: string[];
  keyCooldownMs?: number;
  maxRetriesPerKey?: number;
  /** Returns the currently-persisted disabled provider ids. On Vercel,
   * each warm serverless instance holds its OWN copy of `disabledProviders`
   * — a dashboard toggle only patches the instance that served that one
   * request, so every other already-warm instance keeps routing (or not
   * routing) by whatever it thought was true at its last cold start,
   * indefinitely. Real incident: a provider re-enabled from the dashboard
   * kept getting silently skipped by chat requests landing on a different
   * instance, which fell through to Gemini alone and failed once Gemini's
   * free-tier quota was hit. Polled at most once per resyncIntervalMs so
   * a burst of calls within one request (query rewrite + answer) doesn't
   * turn into repeated DB reads. */
  resyncDisabled?: () => Promise<string[]>;
  resyncIntervalMs?: number;
}

interface RegisteredProvider {
  provider: AIProvider;
  keyManager: KeyManager;
}

// No individual provider (groq/gemini/openrouter/cerebras/mistral/custom)
// sets its own fetch timeout, so a slow/hung upstream can take minutes —
// one real request observed took 174 seconds on openrouter. Without a cap
// here, that provider is never failed over away from, and the chat route's
// own outer timeout (apps/web/app/api/chat/route.ts) fires first and
// returns the customer a canned "trouble connecting" reply while this
// promise keeps running in the background and eventually saves the REAL
// answer nobody ever sees. Bounding every provider call here — the one
// place all six funnel through — means a hung provider fails fast enough
// for rotation to actually reach a working one inside the outer timeout.
const PROVIDER_TIMEOUT_MS = 25_000;

class ProviderTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number, providerName: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new ProviderTimeoutError(`${providerName} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export class AIManager {
  private readonly providers = new Map<string, RegisteredProvider>();
  /** Manually disabled providers — separate from health/key state, so an
   * operator can force a provider off (or force-isolate a single one by
   * disabling every other) for experimentation, independent of whether
   * it's actually healthy or has a usable key. Enabled by default. */
  private readonly disabledProviders = new Set<string>();
  private readonly healthTracker: HealthTracker;
  private readonly usageTracker: UsageTracker;
  private readonly failoverOrder: string[];
  private readonly keyCooldownMs: number;
  private readonly maxRetriesPerKey: number;
  private readonly resyncDisabled?: () => Promise<string[]>;
  private readonly resyncIntervalMs: number;
  private lastResyncAt = 0;

  constructor(options: AIManagerOptions = {}) {
    this.failoverOrder =
      options.failoverOrder?.map((name) => name.toLowerCase()) ?? [];
    this.keyCooldownMs = options.keyCooldownMs ?? 30_000;
    this.maxRetriesPerKey = options.maxRetriesPerKey ?? 1;
    this.healthTracker = new HealthTracker();
    this.usageTracker = new UsageTracker();
    this.resyncDisabled = options.resyncDisabled;
    this.resyncIntervalMs = options.resyncIntervalMs ?? 10_000;
  }

  private async maybeResync(): Promise<void> {
    if (!this.resyncDisabled) return;
    if (Date.now() - this.lastResyncAt < this.resyncIntervalMs) return;

    this.lastResyncAt = Date.now();

    try {
      const disabled = new Set(this.resyncDisabled ? await this.resyncDisabled() : []);
      for (const key of this.providers.keys()) {
        const shouldBeDisabled = disabled.has(key);
        if (this.disabledProviders.has(key) !== shouldBeDisabled) {
          if (shouldBeDisabled) {
            this.disabledProviders.add(key);
          } else {
            this.disabledProviders.delete(key);
          }
        }
      }
    } catch {
      // A resync failure (DB hiccup) shouldn't block/break a chat request —
      // keep whatever state this instance already had and try again next call.
    }
  }

  getUsage(): Record<string, ProviderUsage> {
    return this.usageTracker.getAll();
  }

  getProviderStatus(): Array<{
    name: string;
    healthy: boolean;
    hasUsableKey: boolean;
    maskedKey: string | null;
    enabled: boolean;
  }> {
    return Array.from(this.providers.values()).map((entry) => ({
      name: entry.provider.name,
      healthy: this.healthTracker.isAvailable(entry.provider.name),
      hasUsableKey: entry.keyManager.hasAnyUsableKey(entry.provider.name),
      maskedKey: entry.keyManager.getMaskedKey(entry.provider.name),
      enabled: !this.disabledProviders.has(entry.provider.name.toLowerCase()),
    }));
  }

  hasProvider(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }

  isProviderEnabled(name: string): boolean {
    return !this.disabledProviders.has(name.toLowerCase());
  }

  /** Manually forces a provider on/off — takes effect on the very next
   * generate() call, no restart. Used to isolate one provider for testing
   * (disable the rest) or to force a specific one/set off entirely. */
  setProviderEnabled(name: string, enabled: boolean): void {
    const key = name.toLowerCase();

    if (!this.providers.has(key)) {
      throw new Error(`Provider ${name} is not registered.`);
    }

    if (enabled) {
      this.disabledProviders.delete(key);
    } else {
      this.disabledProviders.add(key);
    }
  }

  /** Replaces the active key(s) for an already-registered provider. */
  setProviderKey(name: string, apiKey: string): void {
    const entry = this.providers.get(name.toLowerCase());

    if (!entry) {
      throw new Error(`Provider ${name} is not registered.`);
    }

    entry.keyManager.registerKeys(name, [
      { id: `${name}-ui`, value: apiKey },
    ]);
  }

  /** Removes every key for an already-registered provider — registerKeys()
   * fully replaces the key map, so an empty array leaves it with none,
   * which makes hasAnyUsableKey() correctly return false immediately
   * (not just after a restart). The provider stays registered (no
   * unregister capability exists), just unusable until re-activated. */
  clearProviderKeys(name: string): void {
    const entry = this.providers.get(name.toLowerCase());

    if (!entry) {
      throw new Error(`Provider ${name} is not registered.`);
    }

    entry.keyManager.registerKeys(name, []);
  }

  registerProvider(provider: AIProvider, keys: ProviderKey[]): void {
    const name = provider.name.toLowerCase();

    if (this.providers.has(name)) {
      throw new Error(`Provider ${provider.name} is already registered.`);
    }

    const keyManager = new KeyManager(this.keyCooldownMs);
    keyManager.registerKeys(name, keys);

    this.providers.set(name, {
      provider,
      keyManager,
    });
  }

  getProviders(): AIProvider[] {
    return Array.from(this.providers.values()).map(
      (entry) => entry.provider
    );
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (this.providers.size === 0) {
      throw new Error("No AI providers registered.");
    }

    await this.maybeResync();

    const failures: Error[] = [];

    for (const entry of this.rotatedProviders()) {
      const provider = entry.provider;
      const providerName = provider.name;

      if (this.disabledProviders.has(providerName.toLowerCase())) {
        continue;
      }

      if (!(await this.isProviderHealthy(entry))) {
        continue;
      }

      if (!entry.keyManager.hasAnyUsableKey(providerName)) {
        failures.push(
          new ProviderUnavailableError(
            `Provider ${providerName} has no usable API keys.`
          )
        );
        continue;
      }

      let key = entry.keyManager.getAvailableKey(providerName);

      while (key) {
        const currentKey = key;

        try {
          const response = await retryWithBackoff(
            () => withTimeout(provider.generate(request, currentKey.value), PROVIDER_TIMEOUT_MS, providerName),
            {
              attempts: this.maxRetriesPerKey + 1,
              baseDelayMs: 100,
              maxDelayMs: 1000,
              shouldRetry: (error) =>
                error instanceof RateLimitedError,
            }
          );

          if (!response.success) {
            entry.keyManager.markKeyFailed(
              providerName,
              currentKey.id
            );

            this.usageTracker.recordFailure(providerName);

            failures.push(
              new ProviderUnavailableError(
                `Provider ${providerName} returned an unsuccessful response.`
              )
            );

            key = entry.keyManager.getAvailableKey(providerName);
            continue;
          }

          entry.keyManager.markKeySuccess(
            providerName,
            currentKey.id
          );

          this.healthTracker.recordSuccess(providerName);
          this.usageTracker.recordSuccess(providerName, response.tokens ?? 0);

          return response;
        } catch (cause) {
          const error =
            cause instanceof Error
              ? cause
              : new Error(String(cause));

          this.usageTracker.recordFailure(providerName);

          if (error instanceof InvalidApiKeyError) {
            entry.keyManager.markKeyFailed(
              providerName,
              currentKey.id,
              true
            );

            failures.push(error);

            key = entry.keyManager.getAvailableKey(providerName);
            continue;
          }

          if (error instanceof RateLimitedError) {
            entry.keyManager.markKeyFailed(
              providerName,
              currentKey.id
            );

            this.healthTracker.recordFailure(providerName);

            failures.push(error);

            key = entry.keyManager.getAvailableKey(providerName);
            continue;
          }

          // Same cooldown treatment as RateLimitedError above — without
          // this, an unclassified error (a provider outage, an unusual
          // status code, a network blip) leaves the key "available", so
          // getAvailableKey() below returns the SAME key again and the
          // while(key) loop spins on it forever instead of ever moving
          // on to the next key/provider. Real bug found under load: this
          // exact gap caused 1500+ back-to-back requests to one provider
          // in a single chat call before it happened to escape.
          entry.keyManager.markKeyFailed(
            providerName,
            currentKey.id
          );

          this.healthTracker.recordFailure(providerName);

          failures.push(error);

          key = entry.keyManager.getAvailableKey(providerName);
        }
      }
    }

    throw new AllProvidersFailedError(failures);
  }

  async chat(
    message: string,
    options: {
      temperature?: number;
      systemPrompt?: string;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      stop?: string[];
      seed?: number;
    } = {}
  ): Promise<{ provider: string; response: string; tokens: number }> {
    const result = await this.generate({
      userId: "anonymous",
      sessionId: "anonymous",
      message,
      temperature: options.temperature,
      systemPrompt: options.systemPrompt,
      maxTokens: options.maxTokens,
      topP: options.topP,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      stop: options.stop,
      seed: options.seed,
    });

    return {
      provider: result.provider,
      response: result.message,
      tokens: result.tokens ?? 0,
    };
  }

  /** Round-robins WHICH enabled provider gets tried first, request to
   * request — spreads load across every active provider instead of
   * hammering whichever one is first in failoverOrder every single
   * time, while the rest of orderedProviders()'s fixed priority still
   * applies as the fallback chain once that call starts (so a
   * deliberately-preferred provider still isn't skipped over, just not
   * always first). A per-instance counter, not persisted -- fine, since
   * even a cold-start reset just means rotation restarts at index 0,
   * not that it stops working. */
  private rotationIndex = 0;

  private rotatedProviders(): RegisteredProvider[] {
    const ordered = this.orderedProviders();
    if (ordered.length <= 1) return ordered;

    const start = this.rotationIndex % ordered.length;
    this.rotationIndex = (this.rotationIndex + 1) % ordered.length;

    return [...ordered.slice(start), ...ordered.slice(0, start)];
  }

  private orderedProviders(): RegisteredProvider[] {
    if (this.failoverOrder.length === 0) {
      return Array.from(this.providers.values());
    }

    const ordered: RegisteredProvider[] = [];
    const remaining = new Map(this.providers);

    for (const name of this.failoverOrder) {
      const registered = remaining.get(name.toLowerCase());

      if (registered) {
        ordered.push(registered);
        remaining.delete(name.toLowerCase());
      }
    }

    ordered.push(...remaining.values());

    return ordered;
  }

  private async isProviderHealthy(
    entry: RegisteredProvider
  ): Promise<boolean> {
    const providerName = entry.provider.name;

    if (!this.healthTracker.isAvailable(providerName)) {
      return false;
    }

    if (typeof entry.provider.health !== "function") {
      return true;
    }

    try {
      return await entry.provider.health();
    } catch {
      return false;
    }
  }
}