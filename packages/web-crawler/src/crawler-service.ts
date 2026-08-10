import { createHash } from "crypto";

import { prisma } from "@ai-chat-platform/database";
import { IndexingService } from "@ai-chat-platform/indexing";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";

import { crawlSiteBatch, type CrawlFrontier } from "./crawler";
import { estimatePageCount } from "./estimate";

// No real-world site should ever approach this. crawlSiteBatch()'s BFS
// loop already stops on its own once the link queue is exhausted (a
// real, finite site crawls itself out) — this number exists purely as a
// last-resort runaway guard against a genuinely infinite site (an
// infinite calendar/pagination trap with no natural end), not as a
// practical content limit. There is deliberately no per-path variant
// cap anymore — "crawl everything, no corner left" is the explicit
// requirement, and the exact-URL dedup (the `visited` set) already
// prevents ever re-fetching the same URL twice.
const MAX_PAGES = 200_000;

// A large site cannot finish crawling inside one serverless invocation's
// execution-time cap no matter how that cap is tuned (confirmed live:
// even a raised 60s maxDuration isn't enough for a few hundred pages
// once fetch + LLM tabular extraction + embedding are all counted). This
// bounds how much ONE call to runCrawl() attempts before returning,
// persisting the rest as CrawlTarget.frontierJson so the next call
// (auto-heal's stuck-crawl retry, a fresh "Run now" click, or the daily
// cron) picks up exactly where this one left off instead of either
// timing out mid-page or restarting from the site's root every time.
// Confirmed live on Vercel: a 10-page batch was still killed mid-indexing
// (LLM tabular extraction latency is real and variable, not just ~3s in
// the worst case) — the frontier is now persisted before indexing starts
// specifically so a kill here doesn't lose crawl POSITION even when it
// does happen, but a smaller batch means it happens less often and each
// invocation makes more net forward progress. 5 pages * (~1.2s fetch+pace
// + up to ~6s worst-case index-if-changed) leaves real margin under
// Vercel Hobby's 60s cap.
const MAX_PAGES_PER_BATCH = 5;

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

/** A malformed/corrupt frontierJson shouldn't crash the crawl — treat it
 * the same as no frontier at all (fresh start from the site's root). */
function parseFrontier(raw: string | null): CrawlFrontier | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CrawlFrontier;
  } catch {
    return null;
  }
}

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
      update: { status: "queued", pagesDone: 0, lastError: null, frontierJson: null },
      create: { businessId, url, status: "queued" },
    });

    return toSummary(target);
  }

  /** A full manual reset — discards any resumable frontier, next
   * runCrawl() starts from the site's root. Use for an explicit "start
   * over" action; automated retries (auto-heal) should call runCrawl()
   * directly instead so an in-progress multi-batch crawl resumes rather
   * than restarting from scratch every retry. */
  async queueForCrawl(id: string): Promise<CrawlTargetSummary> {
    const target = await prisma.crawlTarget.update({
      where: { id },
      data: { status: "queued", pagesDone: 0, lastError: null, frontierJson: null },
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
   * `after()`), not inline in a request handler a user is waiting on.
   * Loops internally, processing MAX_PAGES_PER_BATCH pages at a time,
   * until the whole site is actually crawled — "no corner left" is the
   * explicit requirement, and on a host with no execution-time cap
   * (unlike Vercel serverless) there's nothing stopping one call from
   * just finishing the job. Each individual batch still persists its
   * resumable frontier before indexing (see the loop body), so if this
   * DOES get killed partway through — a Vercel deployment hitting its
   * own timeout, a process crash — the next call to runCrawl() resumes
   * this exact loop from where it left off instead of restarting. */
  async runCrawl(id: string): Promise<CrawlTargetSummary> {
    await this.indexing.initialize();
    await this.vectorStore.initialize();

    let lastSummary: CrawlTargetSummary | null = null;

    for (;;) {
      const target = await prisma.crawlTarget.findUniqueOrThrow({ where: { id } });
      const priorFrontier = parseFrontier(target.frontierJson);
      const isFreshStart = !priorFrontier;

      try {
        // Sitemaps can undercount real reachable pages (BFS finds links a
        // sitemap doesn't list) — track the estimate in a mutable local so
        // it can grow to match reality instead of pagesDone silently
        // exceeding a denominator that never moves. A resume keeps the
        // estimate already on the row rather than re-fetching the sitemap.
        let estimate = isFreshStart
          ? await estimatePageCount(target.url, MAX_PAGES)
          : (target.pagesEstimated ?? MAX_PAGES);

        await prisma.crawlTarget.update({
          where: { id },
          data: isFreshStart
            ? { status: "crawling", pagesEstimated: estimate, pagesDone: 0, lastPageCount: 0, lastChunkCount: 0 }
            : { status: "crawling" },
        });

        const batchResult = await crawlSiteBatch(target.url, priorFrontier, {
          maxPagesTotal: MAX_PAGES,
          maxPagesThisBatch: MAX_PAGES_PER_BATCH,
          onPage: (_pagesDoneThisBatch, totalVisitedSoFar) => {
            if (totalVisitedSoFar > estimate) {
              estimate = totalVisitedSoFar;
            }

            // Fire-and-forget progress update — losing one write to a
            // transient DB hiccup shouldn't abort the crawl itself.
            prisma.crawlTarget
              .update({ where: { id }, data: { pagesDone: totalVisitedSoFar, pagesEstimated: estimate } })
              .catch(() => {});
          },
        });

        const pages = batchResult.pages;

        // Persisted BEFORE indexing starts, not after — indexing (LLM
        // tabular extraction + embedding per changed page) is the slow,
        // variable-latency part, and if the process dies partway through
        // it, the crawl POSITION (which pages are already visited) must
        // not be lost even though those particular pages' content won't
        // have made it into the index yet this round.
        await prisma.crawlTarget.update({
          where: { id },
          data: {
            frontierJson: batchResult.frontier ? JSON.stringify(batchResult.frontier) : null,
            pagesDone: batchResult.totalVisitedCount,
            pagesEstimated: Math.max(estimate, batchResult.totalVisitedCount),
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

        const priorPageCount = isFreshStart ? 0 : (target.lastPageCount ?? 0);
        const priorChunkCount = isFreshStart ? 0 : (target.lastChunkCount ?? 0);

        if (batchResult.frontier) {
          // Not finished — persist where this batch left off and loop
          // straight into the next batch rather than returning. Status
          // stays "crawling" in the DB the whole time, so if this process
          // DOES get killed mid-loop, auto-heal's stuck-crawl retry (or a
          // fresh "Run now") resumes from this exact frontier.
          await prisma.crawlTarget.update({
            where: { id },
            data: {
              frontierJson: JSON.stringify(batchResult.frontier),
              pagesDone: batchResult.totalVisitedCount,
              pagesEstimated: Math.max(estimate, batchResult.totalVisitedCount),
              lastPageCount: priorPageCount + pages.length,
              lastChunkCount: priorChunkCount + chunkCount,
            },
          });

          continue;
        }

        // Frontier exhausted — the whole site is actually crawled now.
        const updated = await prisma.crawlTarget.update({
          where: { id },
          data: {
            status: "done",
            frontierJson: null,
            // Self-correct the estimate to the real count so the bar reads
            // 100%, not stuck below it if the sitemap over/under-counted.
            pagesEstimated: batchResult.totalVisitedCount,
            pagesDone: batchResult.totalVisitedCount,
            lastCrawledAt: new Date(),
            lastPageCount: priorPageCount + pages.length,
            lastChunkCount: priorChunkCount + chunkCount,
            lastError: null,
          },
        });

        return toSummary(updated);
      } catch (error) {
        // Deliberately doesn't touch frontierJson — a transient failure
        // (network blip, DB hiccup) shouldn't discard whatever's already
        // been accumulated; the next attempt resumes from the same spot.
        const updated = await prisma.crawlTarget.update({
          where: { id },
          data: {
            status: "error",
            lastCrawledAt: new Date(),
            lastError: error instanceof Error ? error.message : String(error),
          },
        });

        lastSummary = toSummary(updated);
        return lastSummary;
      }
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
