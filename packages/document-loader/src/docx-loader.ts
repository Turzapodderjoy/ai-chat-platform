import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import { LoadedDocument } from "./types";

export async function loadDocx(
  filepath: string
): Promise<LoadedDocument> {

  const buffer = await fs.readFile(filepath);

  const result = await mammoth.extractRawText({
    buffer,
  });

  return {
    filename: path.basename(filepath),
    extension: ".docx",
    text: result.value,
  };
}