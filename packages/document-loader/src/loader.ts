import fs from "fs/promises";
import path from "path";

// @ts-expect-error
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

import { formatTabularRecord } from "@ai-chat-platform/chunker";

import type { LoadedDocument } from "./types";

const TABULAR_EXTENSIONS = new Set([".csv", ".xlsx", ".xls"]);

export class DocumentLoader {
  async load(
    filepath: string
  ): Promise<string> {
    const extension =
      path.extname(filepath).toLowerCase();

    const buffer =
      await fs.readFile(filepath);

    return this.loadBuffer(buffer, extension);
  }

  async loadFromFile(
    file: File
  ): Promise<string> {
    const buffer = Buffer.from(
      await file.arrayBuffer()
    );

    const extension =
      path.extname(file.name).toLowerCase();

    return this.loadBuffer(buffer, extension);
  }

  /** Structured rows for CSV/XLSX/XLS — null for every other extension.
   * One entry per sheet (a CSV has exactly one, named "Sheet1"). The
   * first row of each sheet is treated as the header row. */
  async loadTabular(filepath: string): Promise<LoadedDocument["tabular"]> {
    const extension = path.extname(filepath).toLowerCase();

    if (!TABULAR_EXTENSIONS.has(extension)) {
      return undefined;
    }

    const buffer = await fs.readFile(filepath);
    return this.parseTabular(buffer, extension);
  }

  private async loadBuffer(buffer: Buffer, extension: string): Promise<string> {
    switch (extension) {
      case ".pdf":
        return this.loadPdf(buffer);

      case ".docx":
        return this.loadDocx(buffer);

      case ".csv":
      case ".xlsx":
      case ".xls": {
        const sheets = this.parseTabular(buffer, extension);
        return sheets
          .map((sheet) =>
            sheet.rows.map((row) => formatTabularRecord(sheet.headers, row)).join("\n\n")
          )
          .join("\n\n");
      }

      default:
        return buffer.toString("utf8");
    }
  }

  private parseTabular(
    buffer: Buffer,
    extension: string
  ): NonNullable<LoadedDocument["tabular"]> {
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      // CSV has no sheet concept — XLSX.read still parses it into one
      // sheet named "Sheet1" via this codepath, same API either way.
      raw: extension === ".csv" ? undefined : true,
    });

    return workbook.SheetNames.map((sheet) => {
      const rows: string[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheet]!, {
        header: 1,
        defval: "",
        raw: false,
      });

      const [headerRow, ...dataRows] = rows;
      const headers = (headerRow ?? []).map((h) => String(h));

      return {
        sheet,
        headers,
        rows: dataRows.map((row) => row.map((cell) => String(cell))),
      };
    });
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
