import type { LoadedDocument } from "@ai-chat-platform/document-loader";
import type { TextChunk } from "@ai-chat-platform/chunker";

export interface IngestionResult {
  document: LoadedDocument;

  chunks: TextChunk[];

  chunkCount: number;

  createdAt: Date;
}