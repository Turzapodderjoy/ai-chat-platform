import { Chunker } from "@ai-chat-platform/chunker";
import { DocumentLoader } from "@ai-chat-platform/document-loader";

import type { IngestionResult } from "./types";

export class IngestionPipeline {
  private readonly loader = new DocumentLoader();

  private readonly chunker = new Chunker();

  async ingest(filepath: string): Promise<IngestionResult> {
    const text = await this.loader.load(filepath);

    const chunks = this.chunker.chunk(text);

    return {
      document: {
        filename: filepath.split(/[\\/]/).pop() ?? filepath,
        extension: filepath.substring(filepath.lastIndexOf(".")),
        text,
      },
      chunks,
      chunkCount: chunks.length,
      createdAt: new Date(),
    };
  }
}