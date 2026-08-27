import { prisma } from "@ai-chat-platform/database";
import * as XLSX from "xlsx";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";
import type { VisionService } from "@ai-chat-platform/vision";
import type { IndexingService } from "@ai-chat-platform/indexing";

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
// A real product name is never this long or multi-line — this is what a
// malformed source table looks like once it hits the CSV parser: a row
// whose cell boundaries didn't survive round-tripping through
// chunkTabularTable (an unescaped quote/comma in the original page
// content), so XLSX folds several rows' worth of text into one cell.
// Confirmed live: a shared "related products" widget rendered on many
// unrelated product pages produced exactly this — one page's copy of it
// failed to parse cleanly and left a Product row whose name was a raw
// multi-line CSV dump with price:null. Rejecting at the source instead
// of storing garbage and hoping downstream code tolerates it.
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
type Chunk = { documentId: string; chunkId: string; text: string; metadata?: Record<string, unknown> };

const EMPTY_RESULT: ProductSyncResult = { created: 0, updated: 0, unchanged: 0 };

function addResults(a: ProductSyncResult, b: ProductSyncResult): ProductSyncResult {
  return { created: a.created + b.created, updated: a.updated + b.updated, unchanged: a.unchanged + b.unchanged };
}

export class ProductSyncService {
  constructor(
    private readonly vectorStore: VectorStoreManager,
    private readonly vision?: VisionService,
    private readonly indexing?: IndexingService
  ) {}

  /** Fire-and-forget: turns a product photo into a searchable text chunk
   * (see VisionService's own comment for why text, not a real image-
   * embedding index) so a customer's own photo of this item can surface
   * it via the normal retrieval pipeline. Non-blocking — a slow/failed
   * vision call must never hold up a crawl batch. documentId is stable
   * per product so re-captioning replaces the old chunk instead of
   * accumulating duplicates. */
  private captionProductImage(businessId: string, productId: string, imageUrl: string): void {
    this.captionProductImageAwaited(businessId, productId, imageUrl).catch(() => {});
  }

  private async captionProductImageAwaited(businessId: string, productId: string, imageUrl: string): Promise<void> {
    if (!this.vision || !this.indexing) return;
    const documentId = `product-image:${productId}`;

    const result = await this.vision.describeImage(imageUrl);
    if (!result) return; // no key configured, fetch failed, or the vision call itself failed — see VisionService's own error logging
    const captionText = [result.description, result.readText ? `Visible text: ${result.readText}` : ""]
      .filter(Boolean)
      .join("\n");
    if (!captionText.trim()) return;

    await prisma.product.update({ where: { id: productId }, data: { imageCaption: captionText } }).catch(() => {});
    await this.vectorStore.deleteByDocumentId(documentId).catch(() => {});
    await this.indexing.index({
      filename: `product-image:${productId}`,
      text: captionText,
      documentId,
      skipExtraction: true,
      metadata: { businessId, source: "product-image", productId, imageUrl },
    });
  }

  /** Full pass — scans every chunk this business has. Correct after any
   * recrawl, but O(whole knowledge base) each time, so CrawlerService
   * calls this once at the very end of a target's runCrawl(), not per
   * batch (see syncDocuments below for the incremental path used
   * mid-crawl). */
  async syncForBusiness(businessId: string): Promise<ProductSyncResult> {
    const chunks = await this.vectorStore.listAllChunksForBusiness(businessId);
    return this.syncFromChunks(businessId, chunks);
  }

  /** Incremental pass — only re-derives products for the specific
   * documents that were just (re)indexed, not the whole business. Lets
   * CrawlerService sync the Product table batch-by-batch during a long
   * crawl (visible progress instead of an all-or-nothing wait at the
   * end) without paying the full-scan cost on every 5-page batch. */
  async syncDocuments(businessId: string, documentIds: string[]): Promise<ProductSyncResult> {
    if (documentIds.length === 0) return EMPTY_RESULT;

    const perDocument = await Promise.all(
      documentIds.map((documentId) => this.vectorStore.listChunksForDocument(documentId))
    );

    const chunks: Chunk[] = perDocument.flatMap((docChunks, i) =>
      docChunks.map((c) => ({ ...c, documentId: documentIds[i]! }))
    );

    return this.syncFromChunks(businessId, chunks);
  }

  private async syncFromChunks(businessId: string, chunks: Chunk[]): Promise<ProductSyncResult> {
    const tabular = chunks.filter((c) => {
      const method = c.metadata?.chunkingMethod;
      return method === "llm-extracted" || method === "caller-tabular";
    });

    const byDocument = new Map<string, Chunk[]>();
    for (const chunk of tabular) {
      const list = byDocument.get(chunk.documentId) ?? [];
      list.push(chunk);
      byDocument.set(chunk.documentId, list);
    }

    let result = EMPTY_RESULT;
    for (const docChunks of byDocument.values()) {
      result = addResults(result, await this.syncDocument(businessId, docChunks));
    }

    return result;
  }

  private async syncDocument(businessId: string, docChunks: Chunk[]): Promise<ProductSyncResult> {
    const pageUrl =
      (docChunks[0]?.metadata?.url as string | undefined) ??
      (docChunks[0]?.metadata?.filename as string | undefined) ??
      docChunks[0]?.documentId;
    if (!pageUrl) return EMPTY_RESULT;

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

    let created = 0;
    let updated = 0;
    let unchanged = 0;

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

      // Prefer matching by SKU when one is present -- the same physical
      // product legitimately gets extracted from more than one page (a
      // "related products" widget, several category listings, the
      // product's own page), and matching only by sourceUrl gave each of
      // those its own row: one real product, several duplicate Product
      // entries. Confirmed live: one drill machine had 4 separate rows
      // from 4 different pages, all with the same SKU. Falls back to the
      // sourceUrl match (a real single-product page's own URL, or a
      // slugged-name key when no SKU exists) so a genuinely SKU-less
      // product still dedupes against itself on re-sync.
      const existing = product.sku
        ? await prisma.product.findFirst({ where: { businessId, sku: product.sku } })
        : await prisma.product.findUnique({
            where: { businessId_sourceUrl: { businessId, sourceUrl } },
          });

      if (!existing) {
        const row = await prisma.product.create({ data: { businessId, sourceUrl, ...candidate } });
        if (candidate.imageUrl) this.captionProductImage(businessId, row.id, candidate.imageUrl);
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
      if (candidate.imageUrl && candidate.imageUrl !== existing.imageUrl) {
        this.captionProductImage(businessId, existing.id, candidate.imageUrl);
      }
      updated++;
    }

    return { created, updated, unchanged };
  }

  /** Backfill for products that existed before image captioning shipped
   * (or were captioned while the vision call failed) — everything else
   * captions itself automatically on create/update above. Bounded per
   * call (dashboard "Caption images" button) rather than firing
   * hundreds of vision calls unbounded in one click. */
  async captionMissingImages(businessId: string, limit = 25): Promise<{ queued: number }> {
    if (!this.vision || !this.indexing) return { queued: 0 };

    const rows = await prisma.product.findMany({
      where: { businessId, imageUrl: { not: null }, imageCaption: null },
      select: { id: true, imageUrl: true },
      take: limit,
    });

    // Sequential, not Promise.all/fire-all-at-once — confirmed live that
    // 25 concurrent Gemini vision calls on one key all came back 503
    // ("high demand") simultaneously, i.e. the burst itself was the
    // cause, not a real outage. Still fire-and-forget from the caller's
    // perspective (this whole function isn't awaited by its route), just
    // paced internally.
    (async () => {
      for (const row of rows) {
        if (!row.imageUrl) continue;
        await this.captionProductImageAwaited(businessId, row.id, row.imageUrl);
      }
    })().catch(() => {});

    return { queued: rows.length };
  }
}
