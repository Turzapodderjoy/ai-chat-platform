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

  search(
    embedding: number[],
    limit?: number
  ): Promise<SearchResult[]>;
}