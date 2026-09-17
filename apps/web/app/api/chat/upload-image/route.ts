import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

import { PERSISTENT_UPLOADS_DIR } from "../../../../lib/paths";
import { getPublicBaseUrl } from "../../../../lib/request-origin";

// Same CORS reasoning as /api/chat — the widget runs on the client's own
// site, a different origin from this app.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Not the ephemeral os.tmpdir() UPLOAD_DIR used for knowledge-base
// document ingestion (see lib/paths.ts's own comment on why that one is
// transient) — a chat photo needs to stay fetchable for as long as the
// conversation/vision call needs it. Persistent, out-of-release
// directory, served through the dynamic /uploads/[...path] route (not
// Next's static public/ file serving -- see PERSISTENT_UPLOADS_DIR's own
// comment for why a plain public/ symlink doesn't work here).
const UPLOAD_DIR = path.join(PERSISTENT_UPLOADS_DIR, "chat-images");

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** The website widget's "attach a photo" button posts here first to get
 * a public URL, then sends that URL to /api/chat as imageUrl — kept as
 * a separate step (not inlined into /api/chat) so the same uploaded
 * image url can be displayed back in the message bubble immediately,
 * before the chat reply comes back. */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const ext = ALLOWED_TYPES[contentType.split(";")[0]!];

  if (!ext) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP, or GIF images are supported." }, { status: 400, headers: CORS_HEADERS });
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be non-empty and under 8MB." }, { status: 400, headers: CORS_HEADERS });
  }

  const filename = `${crypto.randomUUID()}.${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  const url = `${getPublicBaseUrl(req)}/uploads/chat-images/${filename}`;
  return NextResponse.json({ url }, { headers: CORS_HEADERS });
}
