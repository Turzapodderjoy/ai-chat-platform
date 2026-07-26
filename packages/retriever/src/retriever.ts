import type {
  RetrieveOptions,
  RetrievedChunk,
  Retriever,
} from "./types";

import { KeywordScorer } from "./keyword-scorer";

interface StoredChunk {
  id: string;

  text: string;

  embedding?: number[];

  metadata?: Record<string, unknown>;
}

export class BasicRetriever
  implements Retriever
{
  private readonly scorer =
    new KeywordScorer();

  constructor(
    private readonly chunks: StoredChunk[]
  ) {}

  async retrieve(
    query: string,
    options: RetrieveOptions = {}
  ): Promise<RetrievedChunk[]> {
    const limit = options.limit ?? 5;

    const minimumScore =
      options.minimumScore ?? 1;

    return this.chunks
      .map((chunk) => ({
        id: chunk.id,

        text: chunk.text,

        metadata: chunk.metadata,

        score: this.scorer.score(
          query,
          chunk.text
        ),
      }))
      .filter(
        (chunk) =>
          chunk.score >= minimumScore
      )
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, limit);
  }
}