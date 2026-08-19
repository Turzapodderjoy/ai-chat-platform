import { cosineSimilarity } from "@ai-chat-platform/retriever";

export interface CachedAnswer {
  question: string;
  answer: string;
  provider: string;
  confidence: number;
  hits: number;
}

interface CacheEntry extends CachedAnswer {
  embedding: number[];
  businessId: string;
  embeddingProvider: string;
}

/**
 * Semantic cache: a new question that means roughly the same thing as one
 * already answered (high embedding cosine similarity, not exact string
 * match — so paraphrases hit too) reuses the stored answer instead of
 * spending LLM tokens on it again. Scoped per business — without that, a
 * cached answer from one client could be served to another. Also scoped
 * per embeddingProvider — same reasoning as VectorStore.search(): two
 * different embedding providers produce incompatible vector spaces, so a
 * "similarity" score between them isn't a valid signal at all, matching-
 * dimension coincidences included. In-memory only, same caveat as the
 * other trackers: move to Postgres once conversations are persisted.
 */
export class ResponseCache {
  private readonly entries: CacheEntry[] = [];

  constructor(
    private readonly threshold = 0.93,
    // Deliberately NOT lowering the similarity threshold to raise the hit
    // rate — a looser match risks serving a cached answer for the wrong
    // product (exactly the class of bug fixed elsewhere this session:
    // "this tape" resolving to a different item). Capacity is the safe
    // lever instead: 500 -> 2000 entries costs a few MB of memory and
    // nothing else, so a business with a wide, frequently-repeated
    // question set doesn't evict useful entries just to make room.
    private readonly maxEntries = 2000
  ) {}

  find(embedding: number[], businessId: string, embeddingProvider: string): CachedAnswer | null {
    let best: { entry: CacheEntry; score: number } | null = null;

    for (const entry of this.entries) {
      if (entry.businessId !== businessId || entry.embeddingProvider !== embeddingProvider) {
        continue;
      }

      const score = cosineSimilarity(embedding, entry.embedding);

      if (score >= this.threshold && (!best || score > best.score)) {
        best = { entry, score };
      }
    }

    if (!best) {
      return null;
    }

    best.entry.hits += 1;
    return best.entry;
  }

  store(
    embedding: number[],
    businessId: string,
    question: string,
    answer: string,
    provider: string,
    confidence: number,
    embeddingProvider: string
  ): void {
    this.entries.push({
      embedding,
      businessId,
      embeddingProvider,
      question,
      answer,
      provider,
      confidence,
      hits: 0,
    });

    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  stats(): { size: number; totalHits: number } {
    return {
      size: this.entries.length,
      totalHits: this.entries.reduce((sum, e) => sum + e.hits, 0),
    };
  }

  /** A cached answer reflects whatever the system prompt said when it was
   * generated — an operator fixing the prompt to correct a wrong answer
   * (e.g. a category-substitution mistake) would otherwise keep serving
   * that exact wrong cached answer indefinitely, since nothing else ever
   * invalidates an entry. Called from AiConfigService on every save. */
  clearForBusiness(businessId: string): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i]!.businessId === businessId) {
        this.entries.splice(i, 1);
      }
    }
  }
}
