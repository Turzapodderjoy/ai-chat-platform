import { NextResponse } from "next/server";

import {
  EmbeddingManager,
  JinaProvider,
} from "@ai-chat-platform/embedding-manager";

export async function GET() {
  console.log("========== EMBEDDING TEST ==========");
  console.log("Working Directory:", process.cwd());
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("JINA exists:", !!process.env.JINA_API_KEY);
  console.log(
    "JINA prefix:",
    process.env.JINA_API_KEY
      ? process.env.JINA_API_KEY.substring(0, 8)
      : "NOT FOUND"
  );
  console.log(
    "Embedding Provider:",
    process.env.EMBEDDING_PROVIDER
  );
  console.log("====================================");

  try {
    const manager = new EmbeddingManager();

    manager.register(new JinaProvider());

    const result = await manager.embed(
      "Hello from AI Chat Platform"
    );

    return NextResponse.json({
      success: true,
      provider: result.provider,
      dimensions: result.dimensions,
      preview: result.embedding.slice(0, 10),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}