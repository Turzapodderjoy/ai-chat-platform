import type { ProviderKey } from "@ai-chat-platform/types";
import {
  AllProvidersFailedError,
  InvalidApiKeyError,
  ProviderUnavailableError,
  RateLimitedError,
  HealthTracker,
  KeyManager,
  UsageTracker,
  retryWithBackoff,
  type ProviderUsage,
} from "@ai-chat-platform/ai-manager";

import type { EmbeddingProvider, EmbeddingResult } from "./types";

interface RegisteredProvider {
  provider: EmbeddingProvider;
  keyManager: KeyManager;
}

// Every embedding provider's embedMany() sends the WHOLE input array as
// ONE API call (see packages/{mistral,embedding-manager/jina}) — there's
// no batching or pacing inside any of them. A single large document (a
// crawled category page can be 100+ chunks) or a bulk backfill run
// therefore fires one huge request per provider per call, which is
// exactly the kind of burst that trips a provider's per-minute
// request/token ceiling (the same class of problem already hit and fixed
// for Groq's chat rate limit in the training pipeline). Splitting into
// smaller sub-batches with a pace between them keeps steady-state usage
// under the ceiling instead of bursting into it.
//
// Empirically benchmarked (packages/embedding-manager/src/scripts/
// benchmark-rate-limits.ts, 2026-07-29) against real Jina/Mistral keys:
// even 60 fully unpaced sequential single-item requests produced zero
// 429s for either provider — a short burst test can't see a per-minute
// ceiling that only bites under SUSTAINED load across many businesses
// over minutes, not a few seconds. Per explicit direction, these values
// are deliberately set well below the observed-clean rate rather than
// pushed toward it — slower and reliable beats fast and occasionally
// rate-limited. Per-provider (not one shared global) since different
// providers can have genuinely different real ceilings.
const DEFAULT_BATCH_CONFIG = { batchSize: 20, delayMs: 1000 };
const PROVIDER_BATCH_CONFIG: Record<string, { batchSize: number; delayMs: number }> = {
  jina: { batchSize: 15, delayMs: 2500 },
  mistral: { batchSize: 15, delayMs: 2500 },
};

function batchConfigFor(providerName: string): { batchSize: number; delayMs: number } {
  return PROVIDER_BATCH_CONFIG[providerName.toLowerCase()] ?? DEFAULT_BATCH_CONFIG;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Same rotation/failover/health-tracking shape as AIManager (packages/
 * ai-manager) — reuses its KeyManager/HealthTracker/UsageTracker/
 * retryWithBackoff/error classes directly rather than re-implementing
 * them, since those primitives were already provider-agnostic. The
 * generate-vs-embed request/response shapes differ enough between chat
 * and embeddings that the orchestration loop itself is duplicated rather
 * than abstracted — worth revisiting if a third rotation-needing domain
 * shows up, not before.
 */
export class EmbeddingManager {
  private readonly providers = new Map<string, RegisteredProvider>();
  private readonly disabledProviders = new Set<string>();
  private readonly healthTracker = new HealthTracker();
  private readonly usageTracker = new UsageTracker();
  private readonly keyCooldownMs: number;
  private readonly maxRetriesPerKey: number;
  /** Advances by one on every call so consecutive embed()/embedMany()
   * calls each start with a DIFFERENT provider instead of always trying
   * the same first-registered one and only moving on when it fails.
   * Spreads load proactively across all healthy providers round-robin
   * style; a call still fails over further down this same rotated order
   * if its starting provider errors, so wrapping back around to a
   * provider that succeeded on a previous call is expected, not a bug. */
  private nextStartIndex = 0;

  constructor(options: { keyCooldownMs?: number; maxRetriesPerKey?: number } = {}) {
    this.keyCooldownMs = options.keyCooldownMs ?? 30_000;
    this.maxRetriesPerKey = options.maxRetriesPerKey ?? 1;
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

  getProviders(): EmbeddingProvider[] {
    return Array.from(this.providers.values()).map((entry) => entry.provider);
  }

  /** Every registered provider's name — used by callers (e.g.
   * VectorStoreRetriever) that need to retry against a SPECIFIC other
   * provider, not just whichever one rotation happens to pick next. */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  hasProvider(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }

  isProviderEnabled(name: string): boolean {
    return !this.disabledProviders.has(name.toLowerCase());
  }

  setProviderEnabled(name: string, enabled: boolean): void {
    const key = name.toLowerCase();

    if (!this.providers.has(key)) {
      throw new Error(`Embedding provider ${name} is not registered.`);
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
      throw new Error(`Embedding provider ${name} is not registered.`);
    }

    entry.keyManager.registerKeys(name, [{ id: `${name}-ui`, value: apiKey }]);
  }

  /** Same reasoning as AIManager.clearProviderKeys() — registerKeys()
   * fully replaces the key map, so an empty array leaves none, making
   * hasAnyUsableKey() correctly return false immediately. */
  clearProviderKeys(name: string): void {
    const entry = this.providers.get(name.toLowerCase());

    if (!entry) {
      throw new Error(`Embedding provider ${name} is not registered.`);
    }

    entry.keyManager.registerKeys(name, []);
  }

  registerProvider(provider: EmbeddingProvider, keys: ProviderKey[]): void {
    const name = provider.name.toLowerCase();

    if (this.providers.has(name)) {
      throw new Error(`Embedding provider ${provider.name} is already registered.`);
    }

    const keyManager = new KeyManager(this.keyCooldownMs);
    keyManager.registerKeys(name, keys);

    this.providers.set(name, { provider, keyManager });
  }

  async embed(text: string): Promise<EmbeddingResult> {
    return this.run((provider, key) => provider.embed(text, key));
  }

  async embedMany(texts: string[]): Promise<EmbeddingResult[]> {
    return this.run(async (provider, key) =>
      provider.embedMany
        ? await provider.embedMany(texts, key)
        : await Promise.all(texts.map((t) => provider.embed(t, key)))
    );
  }

  /** Embeds with ONE specific named provider — bypasses rotation
   * entirely. For a caller that already tried the rotated pick and got
   * no usable results back (e.g. a retrieval whose stored vectors turn
   * out to belong to a different provider's space than the rotated
   * query embedding) and needs to explicitly retry a particular other
   * provider instead of whatever rotation would hand it next. */
  async embedWithProvider(providerName: string, text: string): Promise<EmbeddingResult> {
    const entry = this.providers.get(providerName.toLowerCase());

    if (!entry) {
      throw new Error(`Embedding provider ${providerName} is not registered.`);
    }

    const failures: Error[] = [];
    const result = await this.attemptProvider(
      entry,
      (provider, key) => provider.embed(text, key),
      failures
    );

    if (result === undefined) {
      throw new AllProvidersFailedError(failures);
    }

    return result;
  }

  /** Batch version of embedWithProvider — one specific named provider,
   * bypassing rotation. Splits into per-provider-sized sub-batches
   * (see PROVIDER_BATCH_CONFIG above) paced apart so a large `texts`
   * array can't fire one oversized burst request at this provider. */
  async embedManyWithProvider(providerName: string, texts: string[]): Promise<EmbeddingResult[]> {
    const entry = this.providers.get(providerName.toLowerCase());

    if (!entry) {
      throw new Error(`Embedding provider ${providerName} is not registered.`);
    }

    const { batchSize, delayMs } = batchConfigFor(providerName);
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      if (i > 0) {
        await sleep(delayMs);
      }

      const batch = texts.slice(i, i + batchSize);
      const failures: Error[] = [];

      const result = await this.attemptProvider(
        entry,
        async (provider, key) =>
          provider.embedMany
            ? await provider.embedMany(batch, key)
            : await Promise.all(batch.map((t) => provider.embed(t, key))),
        failures
      );

      if (result === undefined) {
        throw new AllProvidersFailedError(failures);
      }

      results.push(...result);
    }

    return results;
  }

  /** Embeds the same batch with EVERY enabled, healthy, keyed provider —
   * not just one. Used for indexing (uploads/crawls/backfill) so a
   * client's knowledge base is fully mapped under every embedding
   * provider, not just whichever one rotation happened to pick. A
   * provider that fails is skipped, not fatal — partial coverage this
   * run still leaves retrieval working via whichever providers did
   * succeed, and a later backfill pass can fill in the rest. */
  async embedManyAllProviders(
    texts: string[]
  ): Promise<Array<{ provider: string; results: EmbeddingResult[] }>> {
    const names = this.getProviderNames();

    // Every provider embeds the same batch independently — there's no
    // reason to pay the sum of every provider's latency in sequence when
    // the max is all that actually matters. A provider that fails just
    // gets skipped (below), same as before.
    const settled = await Promise.allSettled(
      names.map((name) => this.embedManyWithProvider(name, texts))
    );

    const out: Array<{ provider: string; results: EmbeddingResult[] }> = [];

    settled.forEach((outcome, i) => {
      if (outcome.status === "fulfilled") {
        out.push({ provider: names[i]!, results: outcome.value });
      }
      // Rejected = this provider couldn't embed this batch right now
      // (down, rate-limited, out of quota) — the other providers' results
      // still count, and a scheduled backfill pass retries the gap.
    });

    return out;
  }

  /** Singular-query version of embedManyAllProviders — embeds ONE query
   * with EVERY enabled/healthy/keyed provider in parallel instead of
   * whichever one rotation picks. Retrieval needs this: a chunk's
   * relevance score depends on which embedding model produced the query
   * vector, so a rotated single-provider query makes the same question
   * return different results turn to turn (the correct chunk can score
   * high in one provider's space and low in another's, even though every
   * provider's vector space is fully populated at indexing time via
   * embedManyAllProviders). Querying every provider and letting the
   * caller merge by score makes retrieval consistent instead of a
   * lottery. One user message is cheap to embed N times; this is not
   * indexing-scale traffic. */
  async embedWithAllProviders(text: string): Promise<EmbeddingResult[]> {
    const names = this.getProviderNames();

    const settled = await Promise.allSettled(
      names.map((name) => this.embedWithProvider(name, text))
    );

    return settled
      .filter((outcome): outcome is PromiseFulfilledResult<EmbeddingResult> => outcome.status === "fulfilled")
      .map((outcome) => outcome.value);
  }

  /** Same structure as AIManager.generate(): try each enabled, healthy
   * provider in order, rotating through its keys, until one succeeds or
   * every provider/key combination has failed. */
  private async run<T extends EmbeddingResult | EmbeddingResult[]>(
    operation: (provider: EmbeddingProvider, apiKey: string) => Promise<T>
  ): Promise<T> {
    if (this.providers.size === 0) {
      throw new Error("No embedding providers registered.");
    }

    const failures: Error[] = [];

    // Captured and advanced synchronously, before any `await` below, so
    // concurrent calls each grab a distinct starting index in the order
    // they were invoked rather than racing on a shared counter.
    const allEntries = Array.from(this.providers.values());
    const startIndex = this.nextStartIndex % allEntries.length;
    this.nextStartIndex = (this.nextStartIndex + 1) % allEntries.length;
    const orderedEntries = [
      ...allEntries.slice(startIndex),
      ...allEntries.slice(0, startIndex),
    ];

    for (const entry of orderedEntries) {
      const result = await this.attemptProvider(entry, operation, failures);

      if (result !== undefined) {
        return result;
      }
    }

    throw new AllProvidersFailedError(failures);
  }

  /** One provider's full attempt: skip if disabled/unhealthy/keyless,
   * otherwise rotate through its keys until one works or all are
   * exhausted. Returns undefined (not a throw) on exhaustion so both
   * run()'s rotation loop and embedWithProvider()'s single-provider call
   * can share this without every non-fatal "this provider didn't work"
   * case needing its own try/catch at the call site. */
  private async attemptProvider<T extends EmbeddingResult | EmbeddingResult[]>(
    entry: RegisteredProvider,
    operation: (provider: EmbeddingProvider, apiKey: string) => Promise<T>,
    failures: Error[]
  ): Promise<T | undefined> {
    const provider = entry.provider;
    const providerName = provider.name;

    if (this.disabledProviders.has(providerName.toLowerCase())) {
      return undefined;
    }

    if (!(await this.isProviderHealthy(entry))) {
      return undefined;
    }

    if (!entry.keyManager.hasAnyUsableKey(providerName)) {
      failures.push(
        new ProviderUnavailableError(
          `Embedding provider ${providerName} has no usable API keys.`
        )
      );
      return undefined;
    }

    let key = entry.keyManager.getAvailableKey(providerName);

    while (key) {
      const currentKey = key;

      try {
        const result = await retryWithBackoff(
          () => operation(provider, currentKey.value),
          {
            attempts: this.maxRetriesPerKey + 1,
            baseDelayMs: 100,
            maxDelayMs: 1000,
            shouldRetry: (error) => error instanceof RateLimitedError,
          }
        );

        entry.keyManager.markKeySuccess(providerName, currentKey.id);
        this.healthTracker.recordSuccess(providerName);

        const tokens = Array.isArray(result)
          ? result.reduce((sum, r) => sum + (r.tokens ?? 0), 0)
          : (result.tokens ?? 0);
        this.usageTracker.recordSuccess(providerName, tokens);

        return result;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));

        this.usageTracker.recordFailure(providerName);

        if (error instanceof InvalidApiKeyError) {
          entry.keyManager.markKeyFailed(providerName, currentKey.id, true);
          failures.push(error);
          key = entry.keyManager.getAvailableKey(providerName);
          continue;
        }

        if (error instanceof RateLimitedError) {
          entry.keyManager.markKeyFailed(providerName, currentKey.id);
          this.healthTracker.recordFailure(providerName);
          failures.push(error);
          key = entry.keyManager.getAvailableKey(providerName);
          continue;
        }

        // Same "must cool the key down here too" fix as AIManager —
        // otherwise an unclassified error leaves the key "available"
        // and this loop spins on it forever instead of moving on.
        entry.keyManager.markKeyFailed(providerName, currentKey.id);
        this.healthTracker.recordFailure(providerName);
        failures.push(error);
        key = entry.keyManager.getAvailableKey(providerName);
      }
    }

    return undefined;
  }

  private async isProviderHealthy(entry: RegisteredProvider): Promise<boolean> {
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
