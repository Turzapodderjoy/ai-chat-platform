export interface EmbeddingResult {
  provider: string;
  embedding: number[];
  dimensions: number;
}

export interface EmbeddingProvider {
  readonly name: string;

  embed(text: string): Promise<EmbeddingResult>;

  embedMany?(
    texts: string[]
  ): Promise<EmbeddingResult[]>;
}