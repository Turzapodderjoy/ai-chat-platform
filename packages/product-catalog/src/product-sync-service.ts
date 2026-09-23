import { prisma, reconcileLotsToStock } from "@ai-chat-platform/database";
import * as XLSX from "xlsx";

// Column names an extraction LLM might reasonably choose are decided
// per-page (see TabularExtractionClient's own prompt) -- there's no
// fixed schema to key off, so every recognized field is matched by a
// small alias list instead of a fixed position/name.
const NAME_ALIASES = ["name", "product name", "product", "title", "item"];
const PRICE_ALIASES = ["price", "selling price", "cost"];
const SKU_ALIASES = ["sku", "model", "product code", "code", "item code"];
const STOCK_ALIASES = ["stock", "availability", "in stock", "stock status"];
const DESCRIPTION_ALIASES = ["description", "details", "specification", "specs"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.includes(normalizeHeader(h)));
}

interface ParsedProduct {
  name: string;
  price: string | null;
  sku: string | null;
  stock: string | null;
  description: string | null;
}

// A real product name is never this long or multi-line — this is what a
// malformed source table looks like once it hits the CSV parser: a row
// whose cell boundaries didn't survive round-tripping through the old
// chunkTabularTable, so XLSX folds several rows' worth of text into one
// cell. Rejecting at the source instead of storing garbage.
const MAX_PLAUSIBLE_NAME_LENGTH = 200;

function rowToProduct(headers: string[], row: string[]): ParsedProduct | null {
  const nameIdx = findColumn(headers, NAME_ALIASES);
  const name = nameIdx >= 0 ? row[nameIdx]?.trim() : undefined;
  if (!name) return null;
  if (name.length > MAX_PLAUSIBLE_NAME_LENGTH || name.includes("\n")) return null;

  const priceIdx = findColumn(headers, PRICE_ALIASES);
  const skuIdx = findColumn(headers, SKU_ALIASES);
  const stockIdx = findColumn(headers, STOCK_ALIASES);
  const descIdx = findColumn(headers, DESCRIPTION_ALIASES);

  const used = new Set([nameIdx, priceIdx, skuIdx, stockIdx, descIdx].filter((i) => i >= 0));
  const extras = headers
    .map((h, i) => (used.has(i) || !row[i]?.trim() ? null : `${h}: ${row[i]}`))
    .filter((x): x is string => x !== null);

  const description = [descIdx >= 0 ? row[descIdx]?.trim() : null, ...extras].filter(Boolean).join(" | ") || null;

  return {
    name,
    price: priceIdx >= 0 ? row[priceIdx]?.trim() || null : null,
    sku: skuIdx >= 0 ? row[skuIdx]?.trim() || null : null,
    stock: stockIdx >= 0 ? row[stockIdx]?.trim() || null : null,
    description,
  };
}

/** Manual bulk inventory import (Product Catalog panel's "Import
 * CSV/XLSX" button). XLSX.read auto-detects CSV vs. real .xlsx from the
 * buffer itself, so one path handles both. Always writes every parsed
 * row (create or update by SKU) -- an explicit import is a deliberate
 * action, not a background recrawl. Rows with no SKU always create a
 * new product (no natural key to match an existing one against) --
 * documented behavior, not a bug: re-importing the same SKU-less file
 * duplicates those rows. */
export class ProductSyncService {
  async importRows(businessId: string, fileBuffer: Buffer): Promise<{ created: number; updated: number; skipped: number }> {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(fileBuffer, { type: "buffer" });
    } catch {
      return { created: 0, updated: 0, skipped: 0 };
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]!];
    if (!sheet) return { created: 0, updated: 0, skipped: 0 };

    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, defval: "" });
    if (rows.length < 2) return { created: 0, updated: 0, skipped: 0 };

    const [headerRow, ...dataRows] = rows;
    const headers = headerRow!.map(String);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of dataRows) {
      const product = rowToProduct(headers, row.map(String));
      if (!product) {
        skipped++;
        continue;
      }

      const existing = product.sku ? await prisma.product.findFirst({ where: { businessId, sku: product.sku } }) : null;

      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: { name: product.name, price: product.price, stock: product.stock, description: product.description },
        });
        await reconcileLotsToStock(existing.id);
        updated++;
      } else {
        await prisma.product.create({
          data: {
            businessId,
            name: product.name,
            price: product.price,
            stock: product.stock,
            sku: product.sku,
            description: product.description,
          },
        });
        created++;
      }
    }

    return { created, updated, skipped };
  }
}