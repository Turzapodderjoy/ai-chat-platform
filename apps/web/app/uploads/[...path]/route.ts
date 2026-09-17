import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

import { PERSISTENT_UPLOADS_DIR } from "../../../lib/paths";

const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Serves everything PERSISTENT_UPLOADS_DIR holds (invoice logos, chat
 * images) at the same public URL shape (/uploads/<subfolder>/<file>)
 * these were always saved with -- a dynamic route instead of Next's
 * static public/ file serving, because the actual storage now lives
 * outside this release's own directory (see PERSISTENT_UPLOADS_DIR's own
 * comment in lib/paths.ts for why a public/ symlink there doesn't work).
 * No auth: these URLs were always public (embedded straight into an
 * invoice print page and chat message bubbles with no session check). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;

  // Reject any segment that could escape PERSISTENT_UPLOADS_DIR (".."),
  // rather than trusting path.join to keep the resolved path inside it.
  if (segments.some((s) => s === ".." || s.includes("/") || s.includes("\\"))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const ext = path.extname(segments[segments.length - 1] ?? "").toLowerCase();
  const contentType = CONTENT_TYPE[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = path.join(PERSISTENT_UPLOADS_DIR, ...segments);

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        // Uploaded files are immutable (a new upload always gets a fresh
        // random filename, see the logo/chat-image upload routes) -- safe
        // to cache for a long time.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
