import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { UPLOAD_DIR } from "@ai-chat-platform/config";
import { IngestionPipeline } from "@ai-chat-platform/ingestion";

const pipeline = new IngestionPipeline();

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "No file uploaded",
        },
        { status: 400 }
      );
    }

    await fs.mkdir(UPLOAD_DIR, {
      recursive: true,
    });

    const filename = `${Date.now()}-${file.name}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    const bytes = await file.arrayBuffer();

    await fs.writeFile(filepath, Buffer.from(bytes));

    const result = await pipeline.ingest(filepath);

    return NextResponse.json({
      success: true,

      file: {
        filename,
        originalName: file.name,
        size: file.size,
        characters: result.document.text.length,
      },

      chunks: result.chunks.length,

      firstChunk: result.chunks[0]?.content ?? "",

      preview: result.document.text.substring(0, 300),
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : String(error),
      },
      { status: 500 }
    );
  }
}