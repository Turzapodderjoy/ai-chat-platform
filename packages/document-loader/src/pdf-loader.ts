import fs from "fs/promises";
import path from "path";
import pdf from "pdf-parse";
import { LoadedDocument } from "./types";

export async function loadPdf(
  filepath: string
): Promise<LoadedDocument> {

  const buffer = await fs.readFile(filepath);

  const result = await pdf(buffer);

  return {
    filename: path.basename(filepath),
    extension: ".pdf",
    text: result.text,
  };
}