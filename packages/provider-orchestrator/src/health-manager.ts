export class HealthManager {
  private readonly unhealthyUntil =
    new Map<string, number>();

  markUnhealthy(
    provider: string,
    seconds: number
  ): void {
    this.unhealthyUntil.set(
      provider.toLowerCase(),
      Date.now() + seconds * 1000
    );
  }

  isHealthy(provider: string): boolean {
    const until =
      this.unhealthyUntil.get(
        provider.toLowerCase()
      );

    if (!until) {
      return true;
    }

    if (Date.now() >= until) {
      this.unhealthyUntil.delete(
        provider.toLowerCase()
      );
      return true;
    }

    return false;
  }

  clear(): void {
    this.unhealthyUntil.clear();
  }
}