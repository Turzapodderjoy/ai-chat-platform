import { prisma } from "@ai-chat-platform/database";
import { chunkTabularTable } from "@ai-chat-platform/chunker";
import * as XLSX from "xlsx";
import type { IndexingService } from "@ai-chat-platform/indexing";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";
import type { CrawlerService } from "@ai-chat-platform/web-crawler";
import type { TabularExtractionClient } from "@ai-chat-platform/tabular-extraction";

import { RefreshScheduleService } from "./refresh-schedule-service";

export interface MasterCsv {
  businessId: string;
  content: string;
  updatedAt: string;
}

interface StoredTabularSheet {
  sheet: string;
  headers: string[];
  rows: string[][];
}

/** Wraps a plain-text (char-chunked) chunk into a one-column CSV block —
 * keeps the master CSV consistently CSV-structured end to end instead of
 * mixing real CSV sections with raw text dumps. XLSX's CSV writer
 * handles embedded newlines/commas/quotes in the cell correctly. */
function proseToCsvBlock(text: string): string {
  const sheet = XLSX.utils.aoa_to_sheet([["Content"], [text]]);
  return XLSX.utils.sheet_to_csv(sheet);
}

export class MasterCsvService {
  constructor(
    private readonly crawler: CrawlerService,
    private readonly indexing: IndexingService,
    private readonly vectorStore: VectorStoreManager,
    private readonly extraction: TabularExtractionClient,
    private readonly schedule: RefreshScheduleService
  ) {}

  async get(businessId: string): Promise<MasterCsv | null> {
    const row = await prisma.masterCsv.findUnique({ where: { businessId } });
    if (!row) return null;
    return { businessId: row.businessId, content: row.content, updatedAt: row.updatedAt.toISOString() };
  }

  /** The full refresh: re-crawl every target, re-process every uploaded
   * document, rebuild the one consolidated CSV. Deliberately slow and
   * tolerant — one failing crawl target or document doesn't abort the
   * business's run, same reasoning as IndexingService.backfill(); the
   * next scheduled run (or a manual "Run now") picks up anything missed.
   * Never touches ChatService/retrieval — live chat keeps reading
   * current chunks in real time regardless of when this last ran. */
  async refresh(businessId: string): Promise<MasterCsv> {
    const targets = await this.crawler.listTargets(businessId);
    for (const target of targets) {
      try {
        await this.crawler.runCrawl(target.id);
      } catch (err) {
        // That target failed this round — its existing chunks are left
        // as-is (not deleted), so the business doesn't lose data over a
        // transient crawl failure. Next scheduled run retries it. Logged
        // (not fully silent) — a background refresh failing with zero
        // trace anywhere is exactly what made an earlier real hang here
        // take far too long to diagnose.
        console.error(`[MasterCsvService.refresh] crawl target ${target.id} failed:`, err);
      }
    }

    const documents = await prisma.uploadedDocument.findMany({ where: { businessId } });
    for (const doc of documents) {
      try {
        await this.reprocessUpload(businessId, doc);
      } catch (err) {
        // Same tolerance as crawl targets above.
        console.error(`[MasterCsvService.refresh] document ${doc.originalFilename} failed:`, err);
      }
    }

    // Every crawl target is fully crawled AND embedded by this point
    // (runCrawl() doesn't return until both phases finish) — CSV building
    // is the one remaining phase with no CrawlTarget row to report status
    // from, so it gets its own explicit flag for the dashboard to show.
    await this.schedule.setBuildingCsv(businessId, true);
    try {
      const content = await this.buildCsv(businessId);

      await prisma.masterCsv.upsert({
        where: { businessId },
        create: { businessId, content },
        update: { content },
      });
    } finally {
      await this.schedule.setBuildingCsv(businessId, false);
    }

    await this.schedule.markRun(businessId);

    return this.get(businessId) as Promise<MasterCsv>;
  }

  private async reprocessUpload(
    businessId: string,
    doc: { originalFilename: string; rawText: string; tabularRows: unknown }
  ): Promise<void> {
    const documentId = `upload:${businessId}:${doc.originalFilename}`;

    // A real CSV/XLSX upload is a deterministic source — re-serialize
    // its stored sheets directly, never pay for another LLM call to
    // re-derive what's already exact.
    const storedSheets = doc.tabularRows as StoredTabularSheet[] | null;

    const preChunked = storedSheets
      ? storedSheets.flatMap((sheet) => chunkTabularTable(sheet.headers, sheet.rows))
      : undefined;

    await this.vectorStore.deleteByDocumentId(documentId);
    await this.indexing.index({
      filename: doc.originalFilename,
      text: doc.rawText,
      preChunked,
      documentId,
      metadata: { businessId },
    });
  }

  /** Sectioned concatenation of EVERY chunk — tabular and prose, crawled
   * and uploaded — grouped by source, covering the whole knowledge base
   * (owner's explicit requirement, no exceptions). A true single
   * rectangular schema across every source was considered and rejected:
   * a product-page table has different columns than a price-list upload
   * has different shape than a policy page's prose, and forcing all of
   * that into one wide, mostly-blank table is harder for both a human
   * and the AI to scan than several clean sections kept in their own
   * natural shape. Tabular chunks are already valid CSV text (from
   * chunkTabularTable) and get concatenated as-is; prose chunks get
   * wrapped into a one-column "Content" CSV block so the whole file
   * stays consistently CSV-structured throughout, not a mix of CSV and
   * raw text. */
  private async buildCsv(businessId: string): Promise<string> {
    const chunks = await this.vectorStore.listAllChunksForBusiness(businessId);

    const byDocument = new Map<string, { label: string; blocks: string[] }>();
    for (const chunk of chunks) {
      const label =
        (chunk.metadata?.url as string | undefined) ??
        (chunk.metadata?.filename as string | undefined) ??
        chunk.documentId;

      const method = chunk.metadata?.chunkingMethod as string | undefined;
      const isTabular = method === "llm-extracted" || method === "caller-tabular";
      const block = isTabular ? chunk.text : proseToCsvBlock(chunk.text);

      const entry = byDocument.get(chunk.documentId) ?? { label, blocks: [] };
      entry.blocks.push(block);
      byDocument.set(chunk.documentId, entry);
    }

    return Array.from(byDocument.values())
      .map((entry) => `# Source: ${entry.label}\n${entry.blocks.join("\n")}`)
      .join("\n\n");
  }
}
