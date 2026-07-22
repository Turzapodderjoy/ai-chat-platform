import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { UPLOAD_DIR } from "@ai-chat-platform/config";

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
        {
          status: 400,
        }
      );
    }

    await fs.mkdir(UPLOAD_DIR, {
      recursive: true,
    });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const filename = `${Date.now()}-${file.name}`;

    const filepath = path.join(UPLOAD_DIR, filename);

    await fs.writeFile(filepath, buffer);

    return NextResponse.json({
      success: true,
      filename,
      originalName: file.name,
      filepath,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
      }
    );
  }
}