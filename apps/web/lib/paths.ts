import os from "os";
import path from "path";

export const ROOT_DIR = path.resolve(process.cwd(), "../..");

export const STORAGE_DIR = path.join(ROOT_DIR, "storage");

// os.tmpdir() (not a path under the deployed app directory) — Vercel's
// serverless filesystem is read-only everywhere except /tmp, which is
// exactly what os.tmpdir() resolves to there (and the regular OS temp
// dir locally). Uploaded files only need to exist for the duration of
// one request (read back once by DocumentLoader, then nothing else ever
// reads this path again), so a transient temp dir is the correct home,
// not a persistence bug.
export const UPLOAD_DIR = path.join(os.tmpdir(), "ai-chat-platform-uploads");
