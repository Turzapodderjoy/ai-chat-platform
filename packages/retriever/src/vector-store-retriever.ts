import type { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import type { VectorStoreManager, SearchResult } from "@ai-chat-platform/vector-store";

import type {
  RetrieveOptions,
  RetrievedChunk,
  Retriever,
} from "./types";

// Splits a comparison/joint/relative question ("price of A vs B?", "A, B
// and C — which is cheapest?", "warranty and price of X?") into its
// separate subjects. One blended embedding of the whole sentence tends to
// land near whichever entity is more prominent in the vector space and
// under-retrieve the other(s) — asking once per clause and merging gives
// every named subject its own shot at the top results. A plain
// single-subject question has nothing to split on and falls through to
// exactly the original one-query behavior.
const CLAUSE_SPLIT = /,|\/|\bvs\.?\b|\bversus\b|\band\b|\bor\b/gi;

// A distinctive term (a product code, model number, or specific word)
// can score low in semantic similarity purely by bad luck of embedding
// geometry even though it's an exact, unambiguous match in the text.
// Pulled from the ORIGINAL query, not the split clauses — clause-level
// re-extraction would just repeat the same handful of terms per clause
// for no benefit. Short/common words are filtered out since they'd match
// almost every chunk and add noise instead of signal.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "what", "which", "how",
  "does", "have", "your", "you", "are", "amar", "amader", "apni", "apnar",
  "ki", "kotodin", "kemon", "koto", "ache", "nei", "chai", "chan",
]);

function extractKeywordTerms(query: string): string[] {
  const terms = query
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t.toLowerCase()));

  return Array.from(new Set(terms)).slice(0, 6);
}

function splitIntoClauses(query: string): string[] {
  const parts = query
    .split(CLAUSE_SPLIT)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);

  // A trivial split (0 or 1 usable piece) means there was nothing to fan
  // out — keep the original full query so short/ungrammatical fragments
  // never replace it.
  if (parts.length < 2) {
    return [query];
  }

  return Array.from(new Set([query, ...parts]));
}

export class VectorStoreRetriever implements Retriever {
  constructor(
    private readonly embeddings: EmbeddingManager,
    private readonly vectorStore: VectorStoreManager
  ) {}

  async retrieve(
    query: string,
    options: RetrieveOptions = {}
  ): Promise<RetrievedChunk[]> {
    // 8, not 5 — a narrower top-K makes near-boundary items flicker in
    // and out of the result set purely based on how a question is
    // phrased (e.g. the same product list coming back with 4 items in
    // English vs 3 in Banglish, observed in a real training analysis
    // report), since different phrasings of the same intent land at
    // slightly different points in each embedding space. A wider net
    // converges results across phrasings without needing fragile
    // "is this a catalog/list question" intent detection.
    const limit = options.limit ?? 8;

    // A single query's relevance score depends on which embedding model
    // produced its vector — a chunk can score high in one provider's
    // space and low in another's even though every provider's space is
    // fully populated at indexing time (embedManyAllProviders). Querying
    // with only one rotated provider therefore makes the same question
    // return different (sometimes wrong/incomplete) results turn to
    // turn. Embedding with every provider and merging by score makes
    // retrieval deterministic. Fanning a comparison/joint question out
    // into per-subject clauses (see splitIntoClauses) additionally
    // ensures each named subject gets its own retrieval pass instead of
    // being diluted into one blended embedding.
    const useFixedEmbedding = Boolean(options.embedding && options.embeddingProvider);
    const clauses = useFixedEmbedding ? [query] : splitIntoClauses(query);

    // {embedding, provider} for every (clause × embedding provider)
    // combination, grouped by provider below so each provider's vector
    // set is fetched and scanned only ONCE no matter how many clauses
    // there are — see VectorStoreManager.searchMany's own comment for
    // why a per-clause search() loop was a real, measured latency
    // problem (synchronous full-table cosine scans compounding).
    const perClauseEmbeddings: { embedding: number[]; provider: string }[][] = useFixedEmbedding
      ? [[{ embedding: options.embedding!, provider: options.embeddingProvider! }]]
      : await Promise.all(clauses.map((clause) => this.embeddings.embedWithAllProviders(clause)));

    const byProvider = new Map<string, number[][]>();
    for (const embeddingsForClause of perClauseEmbeddings) {
      for (const { embedding, provider } of embeddingsForClause) {
        const list = byProvider.get(provider) ?? [];
        list.push(embedding);
        byProvider.set(provider, list);
      }
    }

    const bestById = new Map<string, SearchResult>();

    const keywordTerms = useFixedEmbedding ? [] : extractKeywordTerms(query);

    await Promise.all([
      ...(keywordTerms.length > 0
        ? [
            this.vectorStore.keywordSearch(keywordTerms, limit, options.businessId).then((results) => {
              for (const result of results) {
                const existing = bestById.get(result.id);
                if (!existing || result.score > existing.score) {
                  bestById.set(result.id, result);
                }
              }
            }),
          ]
        : []),
      ...Array.from(byProvider.entries()).map(async ([provider, embeddingsForProvider]) => {
        const resultSets = await this.vectorStore.searchMany(
          embeddingsForProvider,
          limit,
          options.businessId,
          provider
        );

        // Same chunk can come back from multiple clauses'/providers'
        // result sets (every chunk is embedded under every provider) —
        // keep the highest score seen for it rather than counting it
        // multiple times.
        for (const results of resultSets) {
          for (const result of results) {
            const existing = bestById.get(result.id);
            if (!existing || result.score > existing.score) {
              bestById.set(result.id, result);
            }
          }
        }
      }),
    ]);

    // Cosine similarity scores are in [-1, 1], unlike the keyword
    // scorer's integer match counts, so this retriever's default
    // threshold is 0, not 1.
    const minimumScore = options.minimumScore ?? 0;

    // A multi-subject question genuinely needs more total chunks than a
    // single-subject one — every clause needs at least a chance to place
    // its own best match in the final set, not get crowded out by
    // another subject's stronger matches. Capped so a long, many-claused
    // sentence can't balloon the prompt unboundedly.
    const finalLimit = clauses.length > 1 ? Math.min(limit * clauses.length, 15) : limit;

    const topResults = Array.from(bestById.values())
      .filter((result) => result.score >= minimumScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, finalLimit);

    // A product page gets split into several small chunks (description,
    // specs, price/SKU line, etc.) — a query can score highly against the
    // description chunk while never surfacing that SAME page's price
    // chunk. Confirmed live: "which is cheapest" retrieved a product's
    // description but not its price line, and the AI told a customer a
    // real, listed price didn't exist. Once any chunk of a page clears
    // the bar, pull in every other chunk of that same page too — a
    // customer question about one product needs that WHOLE product's
    // facts, not whichever single chunk happened to score highest.
    const matchedDocumentIds = new Set(topResults.map((r) => r.documentId));
    const seenChunkIds = new Set(topResults.map((r) => r.id));
    const expanded: RetrievedChunk[] = [];

    for (const documentId of matchedDocumentIds) {
      const siblings = await this.vectorStore.listChunksForDocument(documentId);
      for (const sibling of siblings) {
        if (seenChunkIds.has(sibling.chunkId)) continue;
        seenChunkIds.add(sibling.chunkId);
        // No fresh similarity score for a sibling pulled in this way —
        // ranked just under the page's own matched chunk(s) so genuinely
        // stronger matches from OTHER pages still lead the context.
        const parentScore = topResults.find((r) => r.documentId === documentId)?.score ?? minimumScore;
        expanded.push({
          id: sibling.chunkId,
          text: sibling.text,
          score: parentScore - 0.001,
          metadata: sibling.metadata,
        });
      }
    }

    return [
      ...topResults.map((result) => ({
        id: result.id,
        text: result.text,
        score: result.score,
        metadata: result.metadata,
      })),
      ...expanded,
    ];
  }
}
