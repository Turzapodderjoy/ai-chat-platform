import { Chunker } from "@ai-chat-platform/chunker";
import {
  EmbeddingManager,
  JinaProvider,
} from "@ai-chat-platform/embedding-manager";
import {
  JsonProvider,
  VectorStoreManager,
} from "@ai-chat-platform/vector-store";

import type {
  IndexRequest,
  IndexResult,
} from "./types";

export class IndexingService {
  private embeddingManager = new EmbeddingManager();

  private vectorStore = new VectorStoreManager(
    new JsonProvider()
  );

  private chunker = new Chunker();

  constructor() {
    this.embeddingManager.register(
      new JinaProvider()
    );
  }

  async initialize() {
    await this.vectorStore.initialize();
  }

  async index(
    request: IndexRequest
  ): Promise<IndexResult> {
    const chunks = this.chunker.chunk(request.text);

    const documentId = crypto.randomUUID();

    const vectors = [];

    for (const chunk of chunks) {
      const embedding = await this.embeddingManager.embed(
        chunk.content
      );

      vectors.push({
        id: crypto.randomUUID(),

        documentId,

        chunkId: chunk.id,

        text: chunk.content,

        embedding: embedding.embedding,

        metadata: {
          filename: request.filename,
          chunkIndex: chunk.index,
        },
      });
    }

    await this.vectorStore.upsert(vectors);

    return {
      documentId,
      chunks: chunks.length,
      vectors: vectors.length,
    };
  }
}