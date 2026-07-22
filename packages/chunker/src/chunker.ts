import { TextChunk } from "./types";

export class Chunker {
  constructor(
    private readonly chunkSize = 800,
    private readonly overlap = 150
  ) {}

  chunk(text: string): TextChunk[] {
    const chunks: TextChunk[] = [];

    let start = 0;
    let index = 0;

    while (start < text.length) {
      const end = Math.min(
        start + this.chunkSize,
        text.length
      );

      chunks.push({
        id: crypto.randomUUID(),
        index,
        content: text.slice(start, end),
      });

      if (end === text.length) {
        break;
      }

      start = end - this.overlap;
      index++;
    }

    return chunks;
  }
}