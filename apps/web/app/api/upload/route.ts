import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { UPLOAD_DIR } from "@ai-chat-platform/config";
import { DocumentLoader } from "@ai-chat-platform/document-loader";
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

    // Save uploaded file
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const filename = `${Date.now()}-${file.name}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    const bytes = await file.arrayBuffer();

    await fs.writeFile(filepath, Buffer.from(bytes));

    // Load document
    const loader = new DocumentLoader();
    const rawText = await loader.load(filepath);

    // Initialize pipeline internally via IndexingService
    const indexingService = new IndexingService();
    await indexingService.initialize();

    const result = await indexingService.index({
      filename: file.name,
      text: rawText,
    });

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