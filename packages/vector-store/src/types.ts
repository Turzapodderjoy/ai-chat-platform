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