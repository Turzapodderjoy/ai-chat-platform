import { IngestionPipeline } from "@ai-chat-platform/ingestion";
import { IndexingService } from "@ai-chat-platform/indexing";
import { chunkTabularRows, type TextChunk } from "@ai-chat-platform/chunker";

import type {
  UploadRequest,
  UploadResult,
} from "./types";

export class UploadService {
  constructor(
    private readonly ingestion: IngestionPipeline,
    private readonly indexing: IndexingService
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

    const result =
      await this.indexing.index({
        filename:
          ingestion.document.filename,
        text:
          ingestion.document.text,
        preChunked,
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