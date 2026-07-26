import fs from "fs/promises";
import path from "path";
import { PDFParse } from "pdf-parse";
import type { LoadedDocument } from "./types";

export async function loadPdf(
  filepath: string
): Promise<LoadedDocument> {
  const buffer = await fs.readFile(filepath);

  const parser = new PDFParse({
    data: buffer,
  });

  const result = await parser.getText();

  await parser.destroy();

  return {
    filename: path.basename(filepath),
    extension: ".pdf",
    text: result.text,
  };
}