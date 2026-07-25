export interface APIKey {
  id: string;
  value: string;
}

export class KeyManager {
  private readonly keys = new Map<string, APIKey[]>();

  register(provider: string, keys: string[]): void {
    this.keys.set(
      provider.toLowerCase(),
      keys.map((value, index) => ({
        id: `${provider}-${index + 1}`,
        value,
      }))
    );
  }

  get(provider: string): APIKey | undefined {
    return this.keys
      .get(provider.toLowerCase())
      ?.at(0);
  }

  getAll(provider: string): APIKey[] {
    return (
      this.keys.get(provider.toLowerCase()) ??
      []
    );
  }

  clear(): void {
    this.keys.clear();
  }
}