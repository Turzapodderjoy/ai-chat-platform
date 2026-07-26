import { UploadService } from "@ai-chat-platform/upload";
import { IndexingService } from "@ai-chat-platform/indexing";
import { IngestionPipeline } from "@ai-chat-platform/ingestion";

import type {
  TrainRequest,
  TrainResult,
} from "./types";

export class TrainingService {
  private readonly upload =
    new UploadService(
      new IngestionPipeline(),
      new IndexingService()
    );

  async train(
    request: TrainRequest
  ): Promise<TrainResult> {

    const result =
      await this.upload.upload({
        businessId: request.businessId,
        filepath: request.filepath,
      });

    return {
      success: result.success,
      chunks: result.chunks,
    };
  }
}