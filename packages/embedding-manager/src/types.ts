export interface EmbeddingResult {
  provider: string;
  embedding: number[];
  dimensions: number;
}

export interface EmbeddingProvider {
  name: string;

  embed(text: string): Promise<EmbeddingResult>;

  embedMany?(
    texts: string[]
  ): Promise<EmbeddingResult[]>;
}