import { IngestionPipeline } from "@ai-chat-platform/ingestion";
import { IndexingService } from "@ai-chat-platform/indexing";

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

    const result =
      await this.indexing.index({
        filename:
          ingestion.document.filename,
        text:
          ingestion.document.text,
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