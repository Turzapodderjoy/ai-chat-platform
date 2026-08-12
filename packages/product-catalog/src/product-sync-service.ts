import { prisma } from "@ai-chat-platform/database";
import * as XLSX from "xlsx";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";

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

/** Every tabular chunk is itself valid, self-contained CSV (see
 * chunkTabularTable) -- header row repeated in every batch -- so each
 * chunk parses independently; no need to reassemble a document's
 * chunks back into one CSV first. */
function parseChunkRows(csvText: string): { headers: string[]; rows: string[][] } | null {
  try {
    const workbook = XLSX.read(csvText, { type: "string" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]!];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet!, { header: 1, blankrows: false, defval: "" });
    if (rows.length < 2) return null;

    const [headerRow, ...dataRows] = rows;
    return {
      headers: headerRow!.map(String),
      rows: dataRows.map((r) => r.map(String)),
    };
  } catch {
    return null;
  }
}

/** Any column not recognized as name/price/sku/stock still carries real
 * information (Brand, Original Price, Rating, Warranty, ...) -- folded
 * into description as "Key: value" pairs rather than dropped, same
 * reasoning as the extraction prompt itself using dynamic columns. */
function rowToProduct(headers: string[], row: string[]): ParsedProduct | null {
  const nameIdx = findColumn(headers, NAME_ALIASES);
  const name = nameIdx >= 0 ? row[nameIdx]?.trim() : undefined;
  if (!name) return null;

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

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export interface ProductSyncResult {
  created: number;
  updated: number;
  unchanged: number;
}

/**
 * Turns the extracted tabular chunks (the same ones chat retrieval and
 * MasterCsvService already read) into real Product rows -- one place
 * queryable directly by name/price/stock, no LLM call or embedding
 * search needed. Called once per business at the end of every
 * CrawlerService.runCrawl() (see crawler-service.ts), so it's current
 * after any recrawl path: scheduled refresh, "Recrawl now", or
 * "Add & crawl".
 *
 * Diffs field-by-field against whatever's already stored for that
 * product (matched by (businessId, sourceUrl), the crawled page's own
 * URL) -- an unchanged product is left alone (no DB write at all, so
 * its updatedAt doesn't move either), and only an actually-different
 * field gets written. New products insert; nothing is ever deleted
 * here (a product genuinely removed from the site just stops being
 * refreshed, still visible until someone/something prunes it).
 */
export class ProductSyncService {
  constructor(private readonly vectorStore: VectorStoreManager) {}

  async syncForBusiness(businessId: string): Promise<ProductSyncResult> {
    const chunks = await this.vectorStore.listAllChunksForBusiness(businessId);
    const tabular = chunks.filter((c) => {
      const method = c.metadata?.chunkingMethod;
      return method === "llm-extracted" || method === "caller-tabular";
    });

    const byDocument = new Map<string, typeof tabular>();
    for (const chunk of tabular) {
      const list = byDocument.get(chunk.documentId) ?? [];
      list.push(chunk);
      byDocument.set(chunk.documentId, list);
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const docChunks of byDocument.values()) {
      const pageUrl =
        (docChunks[0]?.metadata?.url as string | undefined) ??
        (docChunks[0]?.metadata?.filename as string | undefined) ??
        docChunks[0]?.documentId;
      if (!pageUrl) continue;

      // One page image applies to every row extracted from that page --
      // exact for a real single-product page, an approximation for a
      // multi-product listing page (no per-row image without deeper HTML
      // parsing than the crawler does today).
      const pageImageUrl = (docChunks[0]?.metadata?.imageUrl as string | undefined) ?? null;

      const rows: ParsedProduct[] = [];
      for (const chunk of docChunks) {
        const parsed = parseChunkRows(chunk.text);
        if (!parsed) continue;
        for (const row of parsed.rows) {
          const product = rowToProduct(parsed.headers, row);
          if (product) rows.push(product);
        }
      }

      // A single-product page's own URL is already a unique key. A
      // multi-row listing page needs one per row -- SKU when present
      // (this business's extraction always includes it), else a slug of
      // the name, so re-syncing doesn't collide every row onto the same
      // sourceUrl.
      const multiRow = rows.length > 1;

      for (const product of rows) {
        const sourceUrl = multiRow ? `${pageUrl}#${product.sku || slugify(product.name)}` : pageUrl;

        const candidate = {
          name: product.name,
          price: product.price,
          description: product.description,
          stock: product.stock,
          imageUrl: pageImageUrl,
          sku: product.sku,
        };

        const existing = await prisma.product.findUnique({
          where: { businessId_sourceUrl: { businessId, sourceUrl } },
        });

        if (!existing) {
          await prisma.product.create({ data: { businessId, sourceUrl, ...candidate } });
          created++;
          continue;
        }

        const changed =
          existing.name !== candidate.name ||
          existing.price !== candidate.price ||
          existing.description !== candidate.description ||
          existing.stock !== candidate.stock ||
          existing.imageUrl !== candidate.imageUrl ||
          existing.sku !== candidate.sku;

        if (!changed) {
          unchanged++;
          continue;
        }

        await prisma.product.update({ where: { id: existing.id }, data: candidate });
        updated++;
      }
    }

    return { created, updated, unchanged };
  }
}
