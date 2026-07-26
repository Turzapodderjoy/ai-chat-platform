import type { TextChunk } from "./types";

export interface ChunkerOptions {
  chunkSize?: number;
  overlap?: number;
}

export class Chunker {
  private readonly chunkSize: number;

  private readonly overlap: number;

  constructor(options: ChunkerOptions = {}) {
    this.chunkSize = options.chunkSize ?? 800;
    this.overlap = options.overlap ?? 150;
  }

  chunk(text: string): TextChunk[] {
    if (!text.trim()) {
      return [];
    }

    const chunks: TextChunk[] = [];

    let start = 0;

    let index = 0;

    while (start < text.length) {
      const end = Math.min(
        start + this.chunkSize,
        text.length
      );

      const content = text
        .slice(start, end)
        .trim();

      if (content.length > 0) {
        chunks.push({
          id: crypto.randomUUID(),

          index,

          content,

          startOffset: start,

          endOffset: end,

          tokenEstimate: this.estimateTokens(content),
        });

        index++;
      }

      if (end >= text.length) {
        break;
      }

      start = Math.max(
        end - this.overlap,
        start + 1
      );
    }

    return chunks;
  }

  private estimateTokens(
    text: string
  ): number {
    return Math.ceil(text.length / 4);
  }
}