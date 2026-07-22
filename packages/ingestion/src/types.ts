import { LoadedDocument } from "@ai-chat-platform/document-loader";
import { TextChunk } from "@ai-chat-platform/chunker";

export interface IngestionResult {
  document: LoadedDocument;
  chunks: TextChunk[];
}