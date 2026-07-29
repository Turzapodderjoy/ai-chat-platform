import type { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";

import type {
  RetrieveOptions,
  RetrievedChunk,
  Retriever,
} from "./types";

export class VectorStoreRetriever implements Retriever {
  constructor(
    private readonly embeddings: EmbeddingManager,
    private readonly vectorStore: VectorStoreManager
  ) {}

  async retrieve(
    query: string,
    options: RetrieveOptions = {}
  ): Promise<RetrievedChunk[]> {
    let embedding = options.embedding;
    let embeddingProvider = options.embeddingProvider;

    if (!embedding) {
      const embedded = await this.embeddings.embed(query);
      embedding = embedded.embedding;
      embeddingProvider = embedded.provider;
    }

    let results = await this.vectorStore.search(
      embedding,
      options.limit ?? 5,
      options.businessId,
      embeddingProvider
    );

    // Embedding rotation means this query's provider is essentially
    // random from the caller's point of view — it has nothing to do
    // with which provider actually embedded this business's stored
    // content. If they don't match, VectorStore.search()'s provider
    // filter correctly (and silently) returns zero records, even though
    // the business may have plenty of real, relevant content sitting
    // under a different provider's vectors. Without this fallback,
    // answer quality would depend on which provider rotation happened
    // to pick for THIS particular query — exactly what must never
    // happen. Retry with every other registered provider before
    // concluding retrieval genuinely found nothing.
    if (results.length === 0) {
      for (const candidate of this.embeddings.getProviderNames()) {
        if (candidate === embeddingProvider) {
          continue;
        }

        try {
          const retried = await this.embeddings.embedWithProvider(candidate, query);
          const retriedResults = await this.vectorStore.search(
            retried.embedding,
            options.limit ?? 5,
            options.businessId,
            retried.provider
          );

          if (retriedResults.length > 0) {
            results = retriedResults;
            break;
          }
        } catch {
          // That provider is unavailable/failed too — try the next one.
          // Genuinely running out of providers just means retrieval
          // really does have nothing, which is the correct outcome.
        }
      }
    }

    // Cosine similarity scores are in [-1, 1], unlike the keyword
    // scorer's integer match counts, so this retriever's default
    // threshold is 0, not 1.
    const minimumScore = options.minimumScore ?? 0;

    return results
      .filter((result) => result.score >= minimumScore)
      .map((result) => ({
        id: result.id,
        text: result.text,
        score: result.score,
        metadata: result.metadata,
      }));
  }
}
