export interface LoadedDocument {
  filename: string;

  extension: string;

  text: string;

  size?: number;

  metadata?: Record<string, unknown>;

  /** Set for CSV/XLSX uploads — one entry per sheet (CSV always has
   * exactly one). `text` still holds a flattened rendering of these same
   * rows for any caller that only wants plain text; a caller that wants
   * one-row-per-chunk (never split, never merged with other rows) should
   * use this instead. */
  tabular?: { sheet: string; headers: string[]; rows: string[][] }[];
}