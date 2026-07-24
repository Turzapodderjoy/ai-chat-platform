import path from "path";
import fs from "fs/promises";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export class DocumentLoader {
  /**
   * Reads a file from disk by path and extracts raw text
   */
  async load(filepath: string): Promise<string> {
    const ext = path.extname(filepath).toLowerCase();
    const buffer = await fs.readFile(filepath);

    if (ext === ".pdf") {
      const parsed = await pdfParse(buffer);
      return parsed.text;
    }

    if (ext === ".docx") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    // Default fallback for plain text files (.txt, .md, .json, csv, etc.)
    return buffer.toString("utf-8");
  }

  /**
   * Alias method so loadFromFile never throws an undefined error
   */
  async loadFromFile(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = path.extname(file.name).toLowerCase();

    if (ext === ".pdf") {
      const parsed = await pdfParse(buffer);
      return parsed.text;
    }

    if (ext === ".docx") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    return buffer.toString("utf-8");
  }
}