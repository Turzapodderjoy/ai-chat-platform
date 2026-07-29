const DEFAULT_FAILURE_THRESHOLD = 4;
const DEFAULT_OFFLINE_COOLDOWN_MS = 60_000;

export class HealthTracker {
  private readonly failures = new Map<string, number>();
  private readonly offlineSince = new Map<string, number>();

  constructor(
    private readonly failureThreshold = DEFAULT_FAILURE_THRESHOLD,
    private readonly offlineCooldownMs = DEFAULT_OFFLINE_COOLDOWN_MS
  ) {}

  getStatus(providerName: string): "healthy" | "warning" | "offline" {
    const count = this.failures.get(providerName) ?? 0;
    const warningThreshold = Math.ceil(this.failureThreshold / 2);

    if (count >= this.failureThreshold) {
      // Once marked offline, generate()'s outer loop skips this provider
      // entirely — meaning recordSuccess() (the only other reset) can
      // never fire again, permanently stranding it offline until a
      // process restart. Expiring the offline mark after a cooldown, the
      // same way KeyManager already cools individual keys down instead
      // of disabling them forever, gives it a real chance to recover.
      const since = this.offlineSince.get(providerName);
      if (since !== undefined && Date.now() - since >= this.offlineCooldownMs) {
        this.failures.delete(providerName);
        this.offlineSince.delete(providerName);
        return "healthy";
      }

      return "offline";
    }

    if (count >= warningThreshold) {
      return "warning";
    }

    return "healthy";
  }

  isAvailable(providerName: string): boolean {
    return this.getStatus(providerName) !== "offline";
  }

  recordFailure(providerName: string): void {
    const count = (this.failures.get(providerName) ?? 0) + 1;
    this.failures.set(providerName, count);

    if (count >= this.failureThreshold && !this.offlineSince.has(providerName)) {
      this.offlineSince.set(providerName, Date.now());
    }
  }

  recordSuccess(providerName: string): void {
    this.failures.delete(providerName);
    this.offlineSince.delete(providerName);
  }
}
