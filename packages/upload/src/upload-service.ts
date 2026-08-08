import { IngestionPipeline } from "@ai-chat-platform/ingestion";
import { IndexingService } from "@ai-chat-platform/indexing";
import { chunkTabularRows, type TextChunk } from "@ai-chat-platform/chunker";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";

import type {
  UploadRequest,
  UploadResult,
} from "./types";

export class UploadService {
  constructor(
    private readonly ingestion: IngestionPipeline,
    private readonly indexing: IndexingService,
    private readonly vectorStore: VectorStoreManager
  ) {}

  async upload(
    request: UploadRequest
  ): Promise<UploadResult> {
    await this.indexing.initialize();

    const ingestion =
      await this.ingestion.ingest(
        request.filepath
      );

    // CSV/XLSX rows go in as one chunk per row (never re-split by the
    // char-based Chunker) so a record's full set of fields is never
    // severed from its identifying value — see chunkTabularRows.
    const preChunked: TextChunk[] | undefined = ingestion.document.tabular
      ? ingestion.document.tabular.flatMap((sheet) => chunkTabularRows(sheet.headers, sheet.rows))
      : undefined;

    // Stable per-(business, original filename) documentId — same
    // reasoning as the crawler's `crawl:${id}:${page.url}` (see
    // crawler-service.ts) — so re-uploading an updated version of the
    // same file (e.g. this week's price list) REPLACES its old chunks
    // instead of leaving them live alongside the new ones. Without this,
    // a stale "Price: 500" row and a fresh "Price: 600" row for the same
    // product would both stay searchable forever, and the AI has no way
    // to know which one is current.
    const documentId = `upload:${request.businessId}:${request.originalFilename}`;
    await this.vectorStore.deleteByDocumentId(documentId);

    const result =
      await this.indexing.index({
        filename:
          ingestion.document.filename,
        text:
          ingestion.document.text,
        preChunked,
        documentId,
        metadata: {
          businessId:
            request.businessId,
        },
      });

    return {
      success: true,
      chunks: result.chunks,
    };
  }
}
