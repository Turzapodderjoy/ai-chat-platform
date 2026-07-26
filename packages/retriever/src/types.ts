export interface RetrievedChunk {
  id: string;

  text: string;

  score: number;

  metadata?: Record<string, unknown>;
}

export interface RetrieveOptions {
  limit?: number;

  minimumScore?: number;
}

export interface Retriever {
  retrieve(
    query: string,
    options?: RetrieveOptions
  ): Promise<RetrievedChunk[]>;
}