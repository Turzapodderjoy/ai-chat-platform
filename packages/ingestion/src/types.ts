import type { LoadedDocument } from "@ai-chat-platform/document-loader";

// Chunking is IndexingService's job (it needs the chunks to embed and
// upsert them) — ingestion only loads a file into text. This used to
// also chunk here and hand the result to UploadService, but nothing
// ever consumed IngestionResult.chunks/chunkCount: IndexingService.index()
// re-chunks the same text from scratch with its own Chunker, so the
// chunking pass here was pure wasted work on every upload.
export interface IngestionResult {
  document: LoadedDocument;

  createdAt: Date;
}