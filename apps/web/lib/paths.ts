import os from "os";
import path from "path";

export const ROOT_DIR = path.resolve(process.cwd(), "../..");

export const STORAGE_DIR = path.join(ROOT_DIR, "storage");

// Confirmed live: files written under apps/web/public/uploads vanished
// on every deploy, because every release is a fresh, separate git
// worktree and that folder isn't tracked in git. A symlink from public/
// into a shared directory was tried and rejected by Turbopack at build
// time (it refuses a public/ asset that resolves outside the project
// root). PERSISTENT_UPLOADS_DIR is that same shared, out-of-release
// directory instead -- set via env on the VPS (same convention as every
// other host-specific path here), served through a dynamic
// /uploads/[...path] route rather than Next's static public/ handling.
// Falls back to a folder inside the repo for local dev, where there's
// only ever one "release" so the original bug can't happen anyway.
export const PERSISTENT_UPLOADS_DIR = process.env.PERSISTENT_UPLOADS_DIR || path.join(ROOT_DIR, "public-uploads");

// os.tmpdir() (not a path under the deployed app directory) — Vercel's
// serverless filesystem is read-only everywhere except /tmp, which is
// exactly what os.tmpdir() resolves to there (and the regular OS temp
// dir locally). Uploaded files only need to exist for the duration of
// one request (read back once by DocumentLoader, then nothing else ever
// reads this path again), so a transient temp dir is the correct home,
// not a persistence bug.
export const UPLOAD_DIR = path.join(os.tmpdir(), "ai-chat-platform-uploads");
