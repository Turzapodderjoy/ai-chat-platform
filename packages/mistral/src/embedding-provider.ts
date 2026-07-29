import { EmbeddingProvider, EmbeddingResult, retryOn429 } from "@ai-chat-platform/embedding-manager";
import { InvalidApiKeyError, RateLimitedError } from "@ai-chat-platform/types";

// Verified with a real key: POST /v1/embeddings, model "mistral-embed",
// input accepts an array natively — one call handles both embed and
// embedMany, unlike Gemini which needs a separate batch endpoint.
const ENDPOINT = "https://api.mistral.ai/v1/embeddings";
const EMBED_MODEL = "mistral-embed";

interface MistralEmbeddingResponse {
  data?: { embedding: number[] }[];
  usage?: { total_tokens?: number };
}

async function callApi(input: string[], apiKey: string): Promise<MistralEmbeddingResponse> {
  return retryOn429(async () => {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBED_MODEL, input }),
    });

    if (!res.ok) {
      const message = `Mistral embedding request failed (${res.status}): ${await res.text().catch(() => "")}`;

      if (res.status === 401 || res.status === 403) {
        throw new InvalidApiKeyError(message);
      }

      if (res.status === 429) {
        throw new RateLimitedError(message);
      }

      throw new Error(message);
    }

    return (await res.json()) as MistralEmbeddingResponse;
  });
}

export class MistralEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mistral";

  async embed(text: string, apiKey?: string): Promise<EmbeddingResult> {
    if (!apiKey) {
      throw new Error("No API key provided");
    }

    const json = await callApi([text], apiKey);
    const item = json.data?.[0];

    if (!item) {
      throw new Error("Mistral returned no embeddings.");
    }

    return {
      provider: this.name,
      embedding: item.embedding,
      dimensions: item.embedding.length,
      tokens: json.usage?.total_tokens ?? 0,
    };
  }

  async embedMany(texts: string[], apiKey?: string): Promise<EmbeddingResult[]> {
    if (!apiKey) {
      throw new Error("No API key provided");
    }

    const json = await callApi(texts, apiKey);

    if (!json.data || json.data.length === 0) {
      throw new Error("Mistral returned no embeddings.");
    }

    const tokensPerItem = Math.round((json.usage?.total_tokens ?? 0) / json.data.length);

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
