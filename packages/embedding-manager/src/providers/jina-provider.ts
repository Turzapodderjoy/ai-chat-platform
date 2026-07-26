import type {
  EmbeddingProvider,
  EmbeddingResult,
} from "../types";

interface JinaEmbeddingItem {
  embedding: number[];
}

interface JinaEmbeddingResponse {
  data: JinaEmbeddingItem[];
}

export class JinaProvider implements EmbeddingProvider {
  readonly name = "jina";

  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey =
      apiKey ??
      process.env.JINA_API_KEY ??
      "";

    if (!this.apiKey) {
      throw new Error("JINA_API_KEY is missing.");
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

    const json =
      (await response.json()) as JinaEmbeddingResponse;

    if (!json.data || json.data.length === 0) {
      throw new Error("Jina returned no embeddings.");
    }

    const item = json.data[0];

    if (!item) {
      throw new Error("Embedding result is undefined.");
    }

    return {
      provider: this.name,
      embedding: item.embedding,
      dimensions: item.embedding.length,
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

    const json =
      (await response.json()) as JinaEmbeddingResponse;

    if (!json.data || json.data.length === 0) {
      throw new Error("Jina returned no embeddings.");
    }

    return json.data.map((item) => ({
      provider: this.name,
      embedding: item.embedding,
      dimensions: item.embedding.length,
    }));
  }
}