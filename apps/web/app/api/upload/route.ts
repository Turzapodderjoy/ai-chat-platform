import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { UPLOAD_DIR } from "@ai-chat-platform/config";
import { DocumentLoader } from "@ai-chat-platform/document-loader";
import { Chunker } from "@ai-chat-platform/chunker";
import { EmbeddingManager, JinaProvider } from "@ai-chat-platform/embedding-manager";
import { VectorStoreManager, LanceDBProvider } from "@ai-chat-platform/vector-store";
import { IndexingService } from "@ai-chat-platform/indexing";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file uploaded" },
        { status: 400 }
      );
    }

    // 1. Save upload to disk
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${Date.now()}-${file.name}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    const bytes = await file.arrayBuffer();
    await fs.writeFile(filepath, Buffer.from(bytes));

    // 2. Extract plain text using DocumentLoader
    const loader = new DocumentLoader();
    const rawText = await loader.load(filepath);

    // 3. Setup RAG pipeline components
    const chunker = new Chunker();

    const jinaProvider = new JinaProvider(process.env.JINA_API_KEY || "");
    const embeddingManager = new EmbeddingManager(jinaProvider);

    const lancedbProvider = new LanceDBProvider();
    await lancedbProvider.initialize();
    const vectorStore = new VectorStoreManager(lancedbProvider);

    // 4. Run Indexing Service
    const indexingService = new IndexingService(
      chunker,
      embeddingManager,
      vectorStore
    );

    const result = await indexingService.index({
      filename: file.name,
      text: rawText,
    });

    // 5. Success
    return NextResponse.json({
      success: true,
      file: {
        filename,
        originalName: file.name,
        size: file.size,
        characters: rawText.length,
      },
      documentId: result.documentId,
      chunks: result.chunks,
      vectors: result.vectors,
      preview: rawText.substring(0, 300),
    });

  } catch (error) {
    console.error("Upload Route Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}