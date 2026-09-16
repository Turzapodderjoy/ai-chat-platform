import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Same persistent-disk convention as /api/chat/upload-image (self-hosted
// VPS, not Vercel's read-only filesystem) -- saved under public so it's
// directly fetchable by URL from the invoice print page.
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "business-logos");

/** Uploads a business's invoice-watermark logo and saves the resulting
 * URL on Business.logoUrl in one step -- there's no separate "set logo
 * URL by hand" use case, so a plain file upload is all this needs. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are supported." }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be non-empty and under 4MB." }, { status: 400 });
  }

  const filename = `${id}-${crypto.randomUUID()}.${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  const logoUrl = `${req.nextUrl.origin}/uploads/business-logos/${filename}`;
  const { prisma } = await import("@ai-chat-platform/database");
  await prisma.business.update({ where: { id }, data: { logoUrl } });

  return NextResponse.json({ logoUrl });
}
