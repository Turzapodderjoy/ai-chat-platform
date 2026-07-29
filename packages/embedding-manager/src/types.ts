export interface EmbeddingResult {
  provider: string;
  embedding: number[];
  dimensions: number;
  tokens?: number;
}

/** Providers must throw (InvalidApiKeyError / RateLimitedError / plain
 * Error) on failure rather than returning a "success: false" shape —
 * same contract as AIProvider, and for the same reason: EmbeddingManager's
 * key-health/failover logic only runs when an error is actually thrown. */
export interface EmbeddingProvider {
  readonly name: string;

  embed(text: string, apiKey?: string): Promise<EmbeddingResult>;

  embedMany?(
    texts: string[],
    apiKey?: string
  ): Promise<EmbeddingResult[]>;

  health?(): Promise<boolean>;
}
