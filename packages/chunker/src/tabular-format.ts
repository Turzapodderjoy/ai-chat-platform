import type { TextChunk } from "./types";

/**
 * "Header: Value" lines, one per non-blank cell — used instead of a raw
 * pipe-table or CSV row so a chunk's embedding carries the column names
 * alongside their values (a bare "12 months" embeds poorly against a
 * query naming the product; "Product: WidgetPro\nWarranty: 12 months"
 * does not).
 */
export function formatTabularRecord(headers: string[], row: string[]): string {
  return headers
    .map((header, i) => [header.trim(), (row[i] ?? "").trim()] as const)
    .filter(([header, value]) => header && value)
    .map(([header, value]) => `${header}: ${value}`)
    .join("\n");
}

/**
 * One chunk per row, never split by the char-based Chunker — a product's
 * full record (name + price + warranty + ...) must never be severed
 * across a chunk boundary, which is what makes a fact "in the knowledge
 * base but the AI can't find it" in the first place. Rows are typically
 * much shorter than the 800-char window this replaces; that's expected,
 * not a bug — uniform chunk size was never the goal.
 */
export function chunkTabularRows(headers: string[], rows: string[][]): TextChunk[] {
  return rows
    .map((row, index) => {
      const content = formatTabularRecord(headers, row);

      return content
        ? {
            id: crypto.randomUUID(),
            index,
            content,
            startOffset: index,
            endOffset: index,
            tokenEstimate: Math.ceil(content.length / 4),
          }
        : null;
    })
    .filter((chunk): chunk is TextChunk => chunk !== null);
}
