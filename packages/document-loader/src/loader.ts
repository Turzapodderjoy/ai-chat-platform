import fs from "fs/promises";
import path from "path";

// @ts-expect-error
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export class DocumentLoader {
  async load(
    filepath: string
  ): Promise<string> {
    const extension =
      path.extname(filepath).toLowerCase();

    const buffer =
      await fs.readFile(filepath);

    switch (extension) {
      case ".pdf":
        return this.loadPdf(buffer);

      case ".docx":
        return this.loadDocx(buffer);

      default:
        return buffer.toString("utf8");
    }
  }

  async loadFromFile(
    file: File
  ): Promise<string> {
    const buffer = Buffer.from(
      await file.arrayBuffer()
    );

    const extension =
      path.extname(file.name).toLowerCase();

    switch (extension) {
      case ".pdf":
        return this.loadPdf(buffer);

      case ".docx":
        return this.loadDocx(buffer);

      default:
        return buffer.toString("utf8");
    }
  }

  private async loadPdf(
    buffer: Buffer
  ): Promise<string> {
    const result =
      await pdfParse(buffer);

    return result.text;
  }

  private async loadDocx(
    buffer: Buffer
  ): Promise<string> {
    const result =
      await mammoth.extractRawText({
        buffer,
      });

    return result.value;
  }
}