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
  /** Skip the LLM tabular-extraction attempt for this page (still gets
   * normal char-chunking) — for pages the caller already knows aren't
   * an individual product (a category listing, homepage, policy page).
   * Lets a caller bound how much of a large crawl pays for an
   * extraction call at all, without touching what extraction itself
   * decides once it does run. */
  skipExtraction?: boolean;
}

export interface IndexResult {
  documentId: string;
  chunks: number;
  vectors: number;
  createdAt: Date;
}