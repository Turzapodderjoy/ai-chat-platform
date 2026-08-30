import type { EmbeddingProvider, EmbeddingResult } from "@ai-chat-platform/embedding-manager";
import { retryOn429 } from "@ai-chat-platform/embedding-manager";
import { InvalidApiKeyError, RateLimitedError } from "@ai-chat-platform/types";

const ENDPOINT = "https://openrouter.ai/api/v1/embeddings";

// NVIDIA Llama Nemotron Embed VL 1B V2 — free tier on OpenRouter
export const EMBEDDING_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2:free";

interface OpenRouterEmbeddingResponse {
  data?: { embedding: number[]; index: number }[];
  usage?: { total_tokens?: number };
}

async function callApi(input: string[], apiKey: string): Promise<OpenRouterEmbeddingResponse> {
  return retryOn429(async () => {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input,
      }),
    });

    if (!res.ok) {
      const message = `OpenRouter embedding request failed (${res.status}): ${await res.text().catch(() => "")}`;

      if (res.status === 401 || res.status === 403) {
        throw new InvalidApiKeyError(message);
      }

      if (res.status === 429) {
        throw new RateLimitedError(message);
      }

      throw new Error(message);
    }

    return (await res.json()) as OpenRouterEmbeddingResponse;
  });
}

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openrouter";

  async embed(text: string, apiKey?: string): Promise<EmbeddingResult> {
    if (!apiKey) {
      throw new Error("No API key provided");
    }

    const json = await callApi([text], apiKey);
    const item = json.data?.[0];

    if (!item) {
      throw new Error("OpenRouter returned no embeddings.");
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
      throw new Error("OpenRouter returned no embeddings.");
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
