import fs from "fs/promises";
import path from "path";
import { LoadedDocument } from "./types";

export async function loadTxt(
  filepath: string
): Promise<LoadedDocument> {

  const text = await fs.readFile(filepath, "utf8");

  return {
    filename: path.basename(filepath),
    extension: ".txt",
    text,
  };
}