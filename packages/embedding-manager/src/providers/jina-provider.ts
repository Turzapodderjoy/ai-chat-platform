import type {
  EmbeddingProvider,
  EmbeddingResult,
} from "../types";
import { retryOn429 } from "../retry";
import { InvalidApiKeyError, RateLimitedError } from "@ai-chat-platform/types";

interface JinaEmbeddingItem {
  embedding: number[];
}

interface JinaEmbeddingResponse {
  data: JinaEmbeddingItem[];
  usage?: { total_tokens?: number };
}

export class JinaProvider implements EmbeddingProvider {
  readonly name = "jina";

  private async callApi(input: string[], apiKey: string): Promise<JinaEmbeddingResponse> {
    return retryOn429(async () => {
      const response = await fetch(
        "https://api.jina.ai/v1/embeddings",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "jina-embeddings-v3",
            input,
          }),
        }
      );

      if (!response.ok) {
        // Must throw the typed errors (not just a plain Error) so
        // EmbeddingManager's key-health/failover logic — which only
        // runs in its catch block — actually fires, same reasoning as
        // every AIProvider in packages/{groq,gemini,openrouter,...}.
        const message = `Jina API Error: ${response.status} ${response.statusText}`;

        if (response.status === 401 || response.status === 403) {
          throw new InvalidApiKeyError(message);
        }

        if (response.status === 429) {
          throw new RateLimitedError(message);
        }

        throw new Error(message);
      }

      return response.json() as Promise<JinaEmbeddingResponse>;
    });
  }

  async embed(text: string, apiKey?: string): Promise<EmbeddingResult> {
    if (!apiKey) {
      throw new Error("No API key provided");
    }

    const json = await this.callApi([text], apiKey);

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
      tokens: json.usage?.total_tokens ?? 0,
    };
  }

  async embedMany(
    texts: string[],
    apiKey?: string
  ): Promise<EmbeddingResult[]> {
    if (!apiKey) {
      throw new Error("No API key provided");
    }

    const json = await this.callApi(texts, apiKey);

    if (!json.data || json.data.length === 0) {
      throw new Error("Jina returned no embeddings.");
    }

    const tokensPerItem = Math.round(
      (json.usage?.total_tokens ?? 0) / json.data.length
    );

    return json.data.map((item) => ({
      provider: this.name,
      embedding: item.embedding,
      dimensions: item.embedding.length,
      tokens: tokensPerItem,
    }));
  }

  async health(): Promise<boolean> {
    return true;
  }
}
