export interface VectorRecord {
  id: string;

  documentId: string;

  chunkId: string;

  text: string;

  embedding: number[];

  metadata?: Record<string, unknown>;
}

export interface SearchResult extends VectorRecord {
  score: number;
}

export interface VectorStore {
  initialize(): Promise<void>;

  upsert(records: VectorRecord[]): Promise<void>;

  /** businessId restricts the search to one client's records — omitting
   * it searches every client sharing this store, which is almost never
   * what a chat request wants.
   *
   * embeddingProvider restricts the comparison to records embedded by
   * the SAME provider as the query. Different embedding providers/models
   * produce vectors in different, mutually incomparable spaces — cosine
   * similarity between them is either safely 0 (different dimensions,
   * e.g. Gemini's 3072 vs Jina's 1024) or, worse, a meaningless nonzero
   * number when dimensions happen to coincide (e.g. Jina vs Mistral,
   * both 1024) without the vectors meaning the same thing at all.
   * Omitting it searches across every provider's records, which is
   * almost never what a real query wants once more than one embedding
   * provider is active. */
  search(
    embedding: number[],
    limit?: number,
    businessId?: string,
    embeddingProvider?: string
  ): Promise<SearchResult[]>;

  /** Scores MANY query embeddings (same businessId/embeddingProvider,
   * e.g. one per clause of a comparison/joint question) against the
   * candidate rows fetched only ONCE, instead of once per embedding —
   * search() does its own fetch+scan per call, so a multi-clause
   * retrieval calling it in a loop refetches and rescans the same
   * business's entire vector set redundantly, which is real, measured
   * latency (each scan is synchronous JS work blocking the event loop,
   * not I/O — it shows up as unrelated concurrent requests slowing down
   * too). Returns one result array per input embedding, same order. */
  searchMany(
    embeddings: number[][],
    limit?: number,
    businessId?: string,
    embeddingProvider?: string
  ): Promise<SearchResult[][]>;

  /** Plain substring match on chunk text, case-insensitive, scored by how
   * many of the given terms hit — a supplement to search()/searchMany(),
   * not a replacement. Pure vector similarity can bury an exact match on
   * a specific term (a product code, model number, or distinctive word)
   * under semantically-similar-but-wrong chunks; this catches it whether
   * or not the embedding space ranked it highly. */
  keywordSearch(
    terms: string[],
    limit?: number,
    businessId?: string
  ): Promise<SearchResult[]>;

  /** Every chunk's text for a business, deduplicated by chunkId — each
   * chunk is stored once PER embedding provider (embedManyAllProviders),
   * so a plain findMany would double/triple-count the same text. Used to
   * decide whether a business's whole knowledge base is small enough to
   * hand a model directly instead of retrieving from it. */
  listUniqueChunkTexts(businessId: string): Promise<string[]>;

  /** One entry per unique chunk (deduped by chunkId, same reasoning as
   * listUniqueChunkTexts) for a single document — backs the Knowledge
   * Hub's per-document "view extracted data" panel. Includes metadata so
   * the caller can tell llm-extracted/caller-tabular chunks (render as a
   * table) from char-chunked ones (render as plain text) and sort by
   * chunkIndex. */
  listChunksForDocument(
    documentId: string
  ): Promise<{ chunkId: string; text: string; metadata?: Record<string, unknown> }[]>;

  /** Every chunk for a business — tabular AND prose — deduped by
   * chunkId, with documentId + metadata so callers can group by source
   * and tell chunkingMethod apart. Backs MasterCsvService's
   * consolidation pass: the master CSV covers the WHOLE knowledge base,
   * not just the tabular subset. */
  listAllChunksForBusiness(
    businessId: string
  ): Promise<{ documentId: string; chunkId: string; text: string; metadata?: Record<string, unknown> }[]>;

  listAll(): Promise<VectorRecord[]>;

  deleteByDocumentId(documentId: string): Promise<void>;

  /** Same as deleteByDocumentId but for many documents in one call — for
   * a caller (e.g. the crawler) that would otherwise delete documents one
   * at a time in a loop. JsonProvider's storage is a single flat file
   * that's read/rewritten in full on every write call, so batching matters
   * here specifically: N single deletes cost N full-file rewrites, one
   * batched call costs one. */
  deleteByDocumentIds(documentIds: string[]): Promise<void>;

  /** Patches metadata on every chunk of a document without touching its
   * embedding — for status updates that shouldn't cost a re-embed. */
  updateMetadata(documentId: string, patch: Record<string, unknown>): Promise<void>;

  /** Same patch applied to many documents in one call — same batching
   * rationale as deleteByDocumentIds. */
  updateMetadataMany(documentIds: string[], patch: Record<string, unknown>): Promise<void>;
}