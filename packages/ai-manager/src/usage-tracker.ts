export interface ProviderUsage {
  requests: number;
  successes: number;
  failures: number;
  tokens: number;
}

/**
 * In-memory only — resets on process restart. Fine for a single-process
 * dev/demo dashboard; move to a persisted UsageRecord table (Postgres)
 * once the app runs across multiple serverless instances.
 */
export class UsageTracker {
  private readonly usage = new Map<string, ProviderUsage>();

  recordSuccess(providerName: string, tokens: number): void {
    const stats = this.getOrInit(providerName);
    stats.requests += 1;
    stats.successes += 1;
    stats.tokens += tokens;
  }

  recordFailure(providerName: string): void {
    const stats = this.getOrInit(providerName);
    stats.requests += 1;
    stats.failures += 1;
  }

  getAll(): Record<string, ProviderUsage> {
    return Object.fromEntries(this.usage);
  }

  private getOrInit(providerName: string): ProviderUsage {
    let stats = this.usage.get(providerName);

    if (!stats) {
      stats = { requests: 0, successes: 0, failures: 0, tokens: 0 };
      this.usage.set(providerName, stats);
    }

    return stats;
  }
}
