import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { getApp } from "../../../lib/app";
import { UPLOAD_DIR } from "../../../lib/paths";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const businessId = form.get("businessId");

    if (typeof businessId !== "string" || !businessId.trim()) {
      return NextResponse.json(
        { success: false, error: "businessId is required" },
        { status: 400 }
      );
    }

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

    const app = await getApp();
    const result = await app.container.router.upload.uploadFile(filepath, businessId, file.name);

    return NextResponse.json({
      file: {
        filename,
        originalName: file.name,
        size: file.size,
      },
      ...result,
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
