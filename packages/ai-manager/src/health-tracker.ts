const DEFAULT_FAILURE_THRESHOLD = 4;

export class HealthTracker {
  private readonly failures = new Map<string, number>();

  constructor(private readonly failureThreshold = DEFAULT_FAILURE_THRESHOLD) {}

  getStatus(providerName: string): "healthy" | "warning" | "offline" {
    const count = this.failures.get(providerName) ?? 0;
    const warningThreshold = Math.ceil(this.failureThreshold / 2);

    if (count >= this.failureThreshold) {
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
  }

  recordSuccess(providerName: string): void {
    this.failures.delete(providerName);
  }
}
