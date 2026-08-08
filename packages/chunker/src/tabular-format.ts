import * as XLSX from "xlsx";

import type { TextChunk } from "./types";

/**
 * "Header: Value" lines, one per non-blank cell — used instead of a raw
 * pipe-table or CSV row so a chunk's embedding carries the column names
 * alongside their values (a bare "12 months" embeds poorly against a
 * query naming the product; "Product: WidgetPro\nWarranty: 12 months"
 * does not). Still used by document-loader's plain-text fallback
 * rendering (not chunk-splitting) for CSV/XLSX content.
 */
export function formatTabularRecord(headers: string[], row: string[]): string {
  return headers
    .map((header, i) => [header.trim(), (row[i] ?? "").trim()] as const)
    .filter(([header, value]) => header && value)
    .map(([header, value]) => `${header}: ${value}`)
    .join("\n");
}

function toCsv(headers: string[], rows: string[][]): string {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  return XLSX.utils.sheet_to_csv(sheet);
}

// Real, not arbitrary: embedding providers (unlike chat models) have
// their own, usually much smaller, input-size limits — a table large
// enough to blow past this would either get rejected outright or
// silently truncated by the embedding API, which is worse than never
// combining rows at all. Comfortably under the tightest common
// embedding-model limits with margin for the header row repeating in
// every batch.
const MAX_CHUNK_CHARS = 6_000;

/**
 * The whole table as ONE chunk (header row + every data row, real CSV
 * text) whenever it reasonably fits — so retrieval hands the model the
 * complete table in one shot instead of one row at a time, letting it
 * actually scan/compare across every item instead of only whatever
 * fragments top-K similarity happened to surface. Falls back to a few
 * large batches (still many rows per chunk, not one) only when the full
 * table is too big for a single embedding call — see MAX_CHUNK_CHARS.
 */
export function chunkTabularTable(headers: string[], rows: string[][]): TextChunk[] {
  if (rows.length === 0) {
    return [];
  }

  const full = toCsv(headers, rows);
  if (full.length <= MAX_CHUNK_CHARS) {
    return [
      {
        id: crypto.randomUUID(),
        index: 0,
        content: full,
        startOffset: 0,
        endOffset: rows.length,
        tokenEstimate: Math.ceil(full.length / 4),
      },
    ];
  }

  // Batch as many whole rows as fit per chunk, header repeated in each
  // batch so every chunk stays independently readable/self-contained —
  // same reasoning as the old one-row-per-chunk design, just applied at
  // the batch level instead of the row level.
  const chunks: TextChunk[] = [];
  let batch: string[][] = [];
  let batchStart = 0;

  const flush = (endIndex: number) => {
    if (batch.length === 0) return;
    const content = toCsv(headers, batch);
    chunks.push({
      id: crypto.randomUUID(),
      index: chunks.length,
      content,
      startOffset: batchStart,
      endOffset: endIndex,
      tokenEstimate: Math.ceil(content.length / 4),
    });
    batch = [];
  };

  rows.forEach((row, i) => {
    const candidate = toCsv(headers, [...batch, row]);
    if (candidate.length > MAX_CHUNK_CHARS && batch.length > 0) {
      flush(i);
      batchStart = i;
    }
    batch.push(row);
  });
  flush(rows.length);

  return chunks;
}
