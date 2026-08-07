import type { TextChunk } from "@ai-chat-platform/chunker";

export interface IndexRequest {
  filename: string;
  text: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
  /** Pre-built chunks (e.g. one-row-per-chunk tabular records from
   * chunkTabularRows) that must bypass the char-based Chunker entirely —
   * splitting them further would re-introduce the exact "fact severed
   * from its record" problem tabular chunking exists to avoid. When set,
   * `text` is ignored for chunking purposes. */
  preChunked?: TextChunk[];
}

export interface IndexResult {
  documentId: string;
  chunks: number;
  vectors: number;
  createdAt: Date;
}