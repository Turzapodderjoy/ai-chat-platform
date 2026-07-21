import type { AIProvider } from "./types";

export class AIManager {
  private providers: AIProvider[] = [];

  register(provider: AIProvider) {
    this.providers.push(provider);
  }

  async chat(message: string) {
    if (this.providers.length === 0) {
      throw new Error("No AI providers registered.");
    }

    let lastError: unknown = null;

    for (const provider of this.providers) {
      try {
        const healthy = await provider.health();

        if (!healthy) continue;

        const response = await provider.chat(message);

        return {
          provider: provider.name,
          response,
        };
      } catch (error) {
        console.log(`${provider.name} failed`);
        lastError = error;
      }
    }

    throw lastError ?? new Error("No provider available.");
  }
}