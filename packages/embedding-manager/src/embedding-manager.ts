import type {
  EmbeddingProvider,
  EmbeddingResult,
} from "./types";

export class EmbeddingManager {
  private providers = new Map<string, EmbeddingProvider>();

  register(provider: EmbeddingProvider) {
    this.providers.set(provider.name, provider);
  }

  getProvider(name?: string): EmbeddingProvider {
    const providerName =
      name ??
      process.env.EMBEDDING_PROVIDER ??
      "jina";

    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(
        `Embedding provider '${providerName}' not found.`
      );
    }

    return provider;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    return this.getProvider().embed(text);
  }

  async embedMany(
    texts: string[]
  ): Promise<EmbeddingResult[]> {
    const provider = this.getProvider();

    if (!provider.embedMany) {
      return Promise.all(
        texts.map((text) => provider.embed(text))
      );
    }

    return provider.embedMany(texts);
  }
}