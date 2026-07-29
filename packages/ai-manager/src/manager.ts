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
}

interface RegisteredProvider {
  provider: AIProvider;
  keyManager: KeyManager;
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

  constructor(options: AIManagerOptions = {}) {
    this.failoverOrder =
      options.failoverOrder?.map((name) => name.toLowerCase()) ?? [];
    this.keyCooldownMs = options.keyCooldownMs ?? 30_000;
    this.maxRetriesPerKey = options.maxRetriesPerKey ?? 1;
    this.healthTracker = new HealthTracker();
    this.usageTracker = new UsageTracker();
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

    const failures: Error[] = [];

    for (const entry of this.orderedProviders()) {
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
            () => provider.generate(request, currentKey.value),
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