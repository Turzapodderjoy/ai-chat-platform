import { DocumentLoader } from "@ai-chat-platform/document-loader";
import { Chunker } from "@ai-chat-platform/chunker";

import { IngestionResult } from "./types";

export class IngestionPipeline {

  private loader = new DocumentLoader();

  private chunker = new Chunker();

  async ingest(filepath: string): Promise<IngestionResult> {

    const document =
      await this.loader.load(filepath);

    const chunks =
      this.chunker.chunk(document.text);

    return {
      document,
      chunks,
    };

  }

}