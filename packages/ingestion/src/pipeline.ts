import { DocumentLoader } from "@ai-chat-platform/document-loader";

import type { IngestionResult } from "./types";

export class IngestionPipeline {
  private readonly loader = new DocumentLoader();

  async ingest(filepath: string): Promise<IngestionResult> {
    const text = await this.loader.load(filepath);

    return {
      document: {
        filename: filepath.split(/[\\/]/).pop() ?? filepath,
        extension: filepath.substring(filepath.lastIndexOf(".")),
        text,
      },
      createdAt: new Date(),
    };
  }
}