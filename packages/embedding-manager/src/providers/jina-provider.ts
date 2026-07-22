import type {
  EmbeddingProvider,
  EmbeddingResult,
} from "../types";

export class JinaProvider implements EmbeddingProvider {
  name = "jina";

  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey =
      apiKey ??
      process.env.JINA_API_KEY ??
      "";

    if (!this.apiKey) {
      throw new Error(
        "JINA_API_KEY is missing."
      );
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const response = await fetch(
      "https://api.jina.ai/v1/embeddings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "jina-embeddings-v3",
          input: [text],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Jina API Error: ${response.status} ${response.statusText}`
      );
    }

    const json = await response.json();

    return {
      provider: "jina",
      embedding: json.data[0].embedding,
      dimensions: json.data[0].embedding.length,
    };
  }

  async embedMany(
    texts: string[]
  ): Promise<EmbeddingResult[]> {
    const response = await fetch(
      "https://api.jina.ai/v1/embeddings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "jina-embeddings-v3",
          input: texts,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Jina API Error: ${response.status} ${response.statusText}`
      );
    }

    const json = await response.json();

    return json.data.map(
      (item: any): EmbeddingResult => ({
        provider: "jina",
        embedding: item.embedding,
        dimensions: item.embedding.length,
      })
    );
  }
}