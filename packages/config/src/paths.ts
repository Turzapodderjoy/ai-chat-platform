import path from "path";

export const ROOT_DIR = path.resolve(process.cwd(), "../..");

export const STORAGE_DIR = path.join(ROOT_DIR, "storage");

export const UPLOAD_DIR = path.join(STORAGE_DIR, "uploads");