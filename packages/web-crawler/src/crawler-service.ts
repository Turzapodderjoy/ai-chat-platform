import { createHash } from "crypto";

import { prisma } from "@ai-chat-platform/database";
import { IndexingService } from "@ai-chat-platform/indexing";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";

import { crawlSite } from "./crawler";
import { estimatePageCount } from "./estimate";

const MAX_PAGES = 25;

// Small pages (under EmbeddingManager's own per-provider batch size)
// embed almost instantly, so without an explicit pace here a crawl with
// many small pages could still fire page after page back-to-back with
// no gap at all — same "don't burst into the ceiling" reasoning as
// EmbeddingManager's own batch pacing, just at the page level instead
// of the chunk level.
const DELAY_BETWEEN_PAGES_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CrawlTargetSummary {
  id: string;
  businessId: string;
  url: string;
  status: string;
  pagesEstimated: number | null;
  pagesDone: number;
  lastCrawledAt: string | null;
  lastPageCount: number | null;
  lastChunkCount: number | null;
  lastError: string | null;
  updatedAt: string;
}

type CrawlTargetRow = {
  id: string;
  businessId: string;
  url: string;
  status: string;
  pagesEstimated: number | null;
  pagesDone: number;
  lastCrawledAt: Date | null;
  lastPageCount: number | null;
  lastChunkCount: number | null;
  lastError: string | null;
  updatedAt: Date;
};

function toSummary(row: CrawlTargetRow): CrawlTargetSummary {
  return {
    id: row.id,
    businessId: row.businessId,
    url: row.url,
    status: row.status,
    pagesEstimated: row.pagesEstimated,
    pagesDone: row.pagesDone,
    lastCrawledAt: row.lastCrawledAt?.toISOString() ?? null,
    lastPageCount: row.lastPageCount,
    lastChunkCount: row.lastChunkCount,
    lastError: row.lastError,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export class CrawlerService {
  // Takes the shared IndexingService (built once in bootstrap, wired to
  // the shared rotating EmbeddingManager) and the shared VectorStoreManager
  // instead of constructing its own of either — a private
  // `new VectorStoreManager(new JsonProvider())` here used to mean this
  // class read/wrote its own separate instance of the store.
  constructor(
    private readonly indexing: IndexingService,
    private readonly vectorStore: VectorStoreManager
  ) {}

  /** Creates (or re-queues) a target. Does NOT crawl — the caller runs
   * `runCrawl` separately, typically in the background, so a live
   * request can respond immediately and the client polls for progress. */
  async addTarget(businessId: string, url: string): Promise<CrawlTargetSummary> {
    const target = await prisma.crawlTarget.upsert({
      where: { businessId_url: { businessId, url } },
      update: { status: "queued", pagesDone: 0, lastError: null },
      create: { businessId, url, status: "queued" },
    });

    return toSummary(target);
  }

  async queueForCrawl(id: string): Promise<CrawlTargetSummary> {
    const target = await prisma.crawlTarget.update({
      where: { id },
      data: { status: "queued", pagesDone: 0, lastError: null },
    });

    return toSummary(target);
  }

  async listTargets(businessId?: string): Promise<CrawlTargetSummary[]> {
    const targets = await prisma.crawlTarget.findMany({
      where: businessId ? { businessId } : undefined,
      orderBy: { createdAt: "desc" },
    });

    return targets.map(toSummary);
  }

  async deleteTargetsForBusiness(businessId: string): Promise<void> {
    await prisma.crawlTarget.deleteMany({ where: { businessId } });
  }

  /** The actual work — call this from a background task (e.g. Next.js
   * `after()`), not inline in a request handler a user is waiting on. */
  async runCrawl(id: string): Promise<CrawlTargetSummary> {
    const target = await prisma.crawlTarget.findUniqueOrThrow({ where: { id } });

    await this.indexing.initialize();
    await this.vectorStore.initialize();

    try {
      // Sitemaps can undercount real reachable pages (BFS finds links a
      // sitemap doesn't list) — track the estimate in a mutable local so
      // it can grow to match reality instead of pagesDone silently
      // exceeding a denominator that never moves.
      let estimate = await estimatePageCount(target.url, MAX_PAGES);

      await prisma.crawlTarget.update({
        where: { id },
        data: { status: "crawling", pagesEstimated: estimate, pagesDone: 0 },
      });

      const pages = await crawlSite(target.url, {
        maxPages: MAX_PAGES,
        onPage: (pagesDone) => {
          if (pagesDone > estimate) {
            estimate = pagesDone;
          }

          // Fire-and-forget progress update — losing one write to a
          // transient DB hiccup shouldn't abort the crawl itself.
          prisma.crawlTarget
            .update({ where: { id }, data: { pagesDone, pagesEstimated: estimate } })
            .catch(() => {});
        },
      });

      // One lookup of existing chunk metadata up front (not per page) so
      // we can tell new vs. updated vs. unchanged pages without embedding
      // content that hasn't actually changed since the last crawl.
      const existingRecords = await this.vectorStore.listAll();
      const existingHashByDoc = new Map<string, string>();
      const existingChunkCountByDoc = new Map<string, number>();

      for (const record of existingRecords) {
        existingChunkCountByDoc.set(
          record.documentId,
          (existingChunkCountByDoc.get(record.documentId) ?? 0) + 1
        );

        if (!existingHashByDoc.has(record.documentId) && record.metadata?.contentHash) {
          existingHashByDoc.set(record.documentId, record.metadata.contentHash as string);
        }
      }

      let chunkCount = 0;
      const crawledAt = new Date().toISOString();

      // Sorted into two batches instead of acting page-by-page — JsonProvider
      // rewrites its ENTIRE file on every write call, so doing this per page
      // meant up to MAX_PAGES full-file rewrites per crawl run. Unchanged
      // pages get one batched metadata patch; changed/new pages get one
      // batched delete before being re-indexed.
      const unchangedDocumentIds: string[] = [];
      const changedPages: Array<{ page: (typeof pages)[number]; documentId: string; contentHash: string; pageStatus: string }> = [];

      for (const page of pages) {
        // Stable per-page documentId so a re-crawl replaces that page's
        // old chunks instead of piling up duplicates forever.
        const documentId = `crawl:${id}:${page.url}`;
        const contentHash = hashText(page.text);
        const previousHash = existingHashByDoc.get(documentId);

        if (previousHash === contentHash) {
          chunkCount += existingChunkCountByDoc.get(documentId) ?? 0;
          unchangedDocumentIds.push(documentId);
          continue;
        }

        changedPages.push({
          page,
          documentId,
          contentHash,
          pageStatus: previousHash ? "updated" : "new",
        });
      }

      // Content identical to last crawl — no need to re-embed it, just
      // refresh the status/timestamp shown in the Knowledge Hub, for all
      // unchanged pages in one write.
      await this.vectorStore.updateMetadataMany(unchangedDocumentIds, {
        pageStatus: "unchanged",
        lastCrawledAt: crawledAt,
      });

      await this.vectorStore.deleteByDocumentIds(changedPages.map((c) => c.documentId));

      for (let i = 0; i < changedPages.length; i++) {
        if (i > 0) {
          await sleep(DELAY_BETWEEN_PAGES_MS);
        }

        const { page, documentId, contentHash, pageStatus } = changedPages[i]!;
        const result = await this.indexing.index({
          filename: page.url,
          text: page.text,
          documentId,
          metadata: {
            businessId: target.businessId,
            source: "crawler",
            url: page.url,
            contentHash,
            pageStatus,
            lastCrawledAt: crawledAt,
          },
        });

        chunkCount += result.chunks;
      }

      const updated = await prisma.crawlTarget.update({
        where: { id },
        data: {
          status: "done",
          // Self-correct the estimate to the real count so the bar reads
          // 100%, not stuck below it if the sitemap over/under-counted.
          pagesEstimated: pages.length,
          pagesDone: pages.length,
          lastCrawledAt: new Date(),
          lastPageCount: pages.length,
          lastChunkCount: chunkCount,
          lastError: null,
        },
      });

      return toSummary(updated);
    } catch (error) {
      const updated = await prisma.crawlTarget.update({
        where: { id },
        data: {
          status: "error",
          lastCrawledAt: new Date(),
          lastError: error instanceof Error ? error.message : String(error),
        },
      });

      return toSummary(updated);
    }
  }

  /** Re-crawls every registered site across every business — what the
   * daily cron calls. Runs sequentially and awaited; nobody's watching a
   * progress bar for this one. */
  async crawlAll(): Promise<CrawlTargetSummary[]> {
    const targets = await prisma.crawlTarget.findMany();
    const results: CrawlTargetSummary[] = [];

    for (const target of targets) {
      results.push(await this.runCrawl(target.id));
    }

    return results;
  }
}
