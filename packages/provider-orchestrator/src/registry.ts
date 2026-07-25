import type { AIProvider } from "./provider";

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(
      provider.config.name.toLowerCase(),
      provider
    );
  }

  get(name: string): AIProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  getAll(): AIProvider[] {
    return [...this.providers.values()];
  }

  has(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }

  clear(): void {
    this.providers.clear();
  }
}