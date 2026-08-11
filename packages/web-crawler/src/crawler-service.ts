import { createHash } from "crypto";

import { prisma } from "@ai-chat-platform/database";
import { IndexingService } from "@ai-chat-platform/indexing";
import type { VectorRecord, VectorStoreManager } from "@ai-chat-platform/vector-store";

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

// How many CrawledPage rows phase 2 processes before re-checking
// existing chunks and re-persisting pagesIndexed — same checkpointing
// reasoning as MAX_PAGES_PER_BATCH, just for the embedding phase.
const INDEX_BATCH_SIZE = 20;

// Bumped whenever the extraction/chunking LOGIC changes in a way that
// should re-process already-crawled pages even though their content
// hasn't (a contentHash match alone used to mean "skip it" — but a
// prompt change, e.g. now extracting single-product pages that used to
// be skipped as NOT_TABULAR, needs those pages reprocessed too). A chunk
// whose stored version doesn't match this is treated as needing
// reindexing regardless of content hash. Bump this again the next time
// extraction/chunking behavior changes.
const EXTRACTION_VERSION = 2;

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
  pagesIndexed: number;
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
  pagesIndexed: number;
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
    pagesIndexed: row.pagesIndexed,
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

  // Two overlapping runCrawl() calls for the SAME target (a double-
  // clicked "Refresh now", auto-heal firing while a manual refresh is
  // already running, two refresh-all triggers in quick succession) race
  // on that target's DB row — confirmed live: one call's read of a
  // legitimate "phase 1 just finished" transition (frontierJson already
  // null, status write not yet landed) got misread as isFreshStart,
  // wiping thousands of pages of real progress back to a sitemap
  // estimate. A single Node process is the only place runCrawl() ever
  // runs from here, so an in-memory lock is sufficient — no DB-level
  // locking needed.
  private readonly targetsInFlight = new Set<string>();

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
    if (this.targetsInFlight.has(id)) {
      // Already being worked on by another concurrent call — don't start
      // a second one racing the first; just report current state.
      const current = await prisma.crawlTarget.findUniqueOrThrow({ where: { id } });
      return toSummary(current);
    }

    this.targetsInFlight.add(id);

    try {
      await this.indexing.initialize();
      await this.vectorStore.initialize();

      const startingTarget = await prisma.crawlTarget.findUniqueOrThrow({ where: { id } });

      // Resuming a process that died mid-embedding (frontier already null,
      // status still "embedding") skips straight back into phase 2 instead
      // of re-crawling — the crawl itself is already fully done.
      if (startingTarget.status !== "embedding") {
        await this.crawlPhase(id);
      }

      return await this.indexPhase(id);
    } catch (error) {
      // Deliberately doesn't touch frontierJson/CrawledPage rows — a
      // transient failure (network blip, DB hiccup) shouldn't discard
      // whatever's already been accumulated; the next attempt resumes
      // from the same spot (crawlPhase resumes from frontierJson,
      // indexPhase resumes from whatever CrawledPage rows are left).
      const updated = await prisma.crawlTarget.update({
        where: { id },
        data: {
          status: "error",
          lastCrawledAt: new Date(),
          lastError: error instanceof Error ? error.message : String(error),
        },
      });

      return toSummary(updated);
    } finally {
      this.targetsInFlight.delete(id);
    }
  }

  /** Phase 1: fetch every page on the site, no embedding yet. Loops
   * internally, MAX_PAGES_PER_BATCH pages per batch, persisting the
   * resumable BFS frontier AND each fetched page's raw text (to
   * CrawledPage) before moving to the next batch — a process death here
   * loses no crawl position and no already-fetched content. Only once
   * the frontier is genuinely exhausted does status flip to "embedding"
   * and control return to runCrawl() for phase 2. This separation is the
   * whole point: embedding (slow, LLM-bound) never starts until crawling
   * (fast, I/O-bound) is completely done, so "is the crawl done" is a
   * real, checkable fact instead of something interleaved batch-by-batch. */
  private async crawlPhase(id: string): Promise<void> {
    for (;;) {
      const target = await prisma.crawlTarget.findUniqueOrThrow({ where: { id } });
      const priorFrontier = parseFrontier(target.frontierJson);
      const isFreshStart = !priorFrontier;

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
          ? {
              status: "crawling",
              pagesEstimated: estimate,
              pagesDone: 0,
              pagesIndexed: 0,
              lastPageCount: 0,
              lastChunkCount: 0,
            }
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

      // Raw text saved BEFORE the frontier is persisted, so a page never
      // ends up "visited" without its content actually being durable.
      for (const page of batchResult.pages) {
        await prisma.crawledPage.upsert({
          where: { crawlTargetId_url: { crawlTargetId: id, url: page.url } },
          create: { crawlTargetId: id, url: page.url, text: page.text, contentHash: hashText(page.text) },
          update: { text: page.text, contentHash: hashText(page.text), fetchedAt: new Date() },
        });
      }

      await prisma.crawlTarget.update({
        where: { id },
        data: {
          frontierJson: batchResult.frontier ? JSON.stringify(batchResult.frontier) : null,
          pagesDone: batchResult.totalVisitedCount,
          pagesEstimated: Math.max(estimate, batchResult.totalVisitedCount),
        },
      });

      if (!batchResult.frontier) {
        // Crawl phase genuinely done — hand off to phase 2.
        await prisma.crawlTarget.update({ where: { id }, data: { status: "embedding" } });
        return;
      }
    }
  }

  /** Phase 2: embed every page crawlPhase fetched, reading from
   * CrawledPage (not memory) so this survives a restart between phases —
   * a page is only deleted from CrawledPage once it's actually indexed
   * (or determined unchanged/duplicate), so resuming mid-phase-2 just
   * means fewer rows left to process, nothing is lost or redone. */
  private async indexPhase(id: string): Promise<CrawlTargetSummary> {
    const target = await prisma.crawlTarget.findUniqueOrThrow({ where: { id } });
    const isFreshStart = target.lastCrawledAt === null;
    const priorPageCount = target.lastPageCount ?? 0;
    const priorChunkCount = target.lastChunkCount ?? 0;
    let chunkCount = 0;
    let pagesProcessed = target.pagesIndexed;

    // Built ONCE, then maintained incrementally as each batch indexes —
    // NOT re-fetched every batch. A large site can accumulate tens of
    // thousands of chunks; re-running a full-table scan every
    // INDEX_BATCH_SIZE pages repeatedly allocates and discards that whole
    // working set, which is exactly what crashed a real run here
    // ("memory allocation ... failed") once a business passed ~25k
    // chunks. select excludes the embedding column — nothing below reads
    // vectors, only documentId/chunkId/contentHash bookkeeping.
    const existingHashByDoc = new Map<string, string>();
    const existingVersionByDoc = new Map<string, number>();
    const existingChunkCountByDoc = new Map<string, number>();
    // A pagination/filter/sort URL trap can serve byte-identical content
    // under many distinct URLs — with no per-path variant cap anymore
    // (explicit "no limitations" requirement), re-running LLM extraction
    // + embedding on every copy would waste real budget on zero new
    // knowledge. First documentId seen for a given content hash becomes
    // canonical; later URLs with the same hash clone its chunks instead
    // of re-indexing from scratch.
    const canonicalDocumentIdByHash = new Map<string, string>();

    {
      const existingRecords = await prisma.vectorRecord.findMany({
        where: { businessId: target.businessId },
        select: { documentId: true, metadata: true },
      });

      for (const record of existingRecords) {
        existingChunkCountByDoc.set(record.documentId, (existingChunkCountByDoc.get(record.documentId) ?? 0) + 1);

        const meta = record.metadata as Record<string, unknown> | null;
        const hash = meta?.contentHash as string | undefined;
        if (hash) {
          if (!existingHashByDoc.has(record.documentId)) existingHashByDoc.set(record.documentId, hash);
          if (!canonicalDocumentIdByHash.has(hash)) canonicalDocumentIdByHash.set(hash, record.documentId);
        }
        // Untagged (pre-versioning) chunks are treated as version 0, so
        // they always fail the version check below and get reindexed.
        if (!existingVersionByDoc.has(record.documentId)) {
          existingVersionByDoc.set(record.documentId, (meta?.extractionVersion as number | undefined) ?? 0);
        }
      }
    }

    for (;;) {
      const pending = await prisma.crawledPage.findMany({
        where: { crawlTargetId: id },
        take: INDEX_BATCH_SIZE,
      });

      if (pending.length === 0) break;

      const crawledAt = new Date().toISOString();
      const unchangedDocumentIds: string[] = [];
      const changedPages: Array<{ page: (typeof pending)[number]; documentId: string; pageStatus: string }> = [];
      const duplicatePages: Array<{ page: (typeof pending)[number]; documentId: string; canonicalDocumentId: string }> = [];

      for (const page of pending) {
        const documentId = `crawl:${id}:${page.url}`;
        const previousHash = existingHashByDoc.get(documentId);
        const previousVersion = existingVersionByDoc.get(documentId);

        if (previousHash === page.contentHash && previousVersion === EXTRACTION_VERSION) {
          chunkCount += existingChunkCountByDoc.get(documentId) ?? 0;
          unchangedDocumentIds.push(documentId);
          continue;
        }

        const canonicalDocumentId = canonicalDocumentIdByHash.get(page.contentHash);
        if (canonicalDocumentId && canonicalDocumentId !== documentId) {
          duplicatePages.push({ page, documentId, canonicalDocumentId });
          continue;
        }

        canonicalDocumentIdByHash.set(page.contentHash, documentId);
        changedPages.push({ page, documentId, pageStatus: previousHash ? "updated" : "new" });
      }

      await this.vectorStore.updateMetadataMany(unchangedDocumentIds, {
        pageStatus: "unchanged",
        lastCrawledAt: crawledAt,
      });

      await this.vectorStore.deleteByDocumentIds(changedPages.map((c) => c.documentId));

      for (let i = 0; i < changedPages.length; i++) {
        if (i > 0) await sleep(DELAY_BETWEEN_PAGES_MS);

        const { page, documentId, pageStatus } = changedPages[i]!;
        const result = await this.indexing.index({
          filename: page.url,
          text: page.text,
          documentId,
          metadata: {
            businessId: target.businessId,
            source: "crawler",
            url: page.url,
            contentHash: page.contentHash,
            extractionVersion: EXTRACTION_VERSION,
            pageStatus,
            lastCrawledAt: crawledAt,
          },
        });

        chunkCount += result.chunks;

        // Keep the maps current for the REST of this run (later batches,
        // and any duplicate in this same batch pointing at this page as
        // canonical) without re-querying the DB.
        existingHashByDoc.set(documentId, page.contentHash);
        existingVersionByDoc.set(documentId, EXTRACTION_VERSION);
        existingChunkCountByDoc.set(documentId, result.chunks);
        canonicalDocumentIdByHash.set(page.contentHash, documentId);
      }

      const canonicalMissing = new Set<string>();

      if (duplicatePages.length > 0) {
        await this.vectorStore.deleteByDocumentIds(duplicatePages.map((d) => d.documentId));

        for (const dup of duplicatePages) {
          const canonicalRecords = await prisma.vectorRecord.findMany({
            where: { documentId: dup.canonicalDocumentId },
          });

          // Canonical page hasn't actually landed in the DB yet — leave
          // this one in CrawledPage, it's retried next time round.
          if (canonicalRecords.length === 0) {
            canonicalMissing.add(dup.documentId);
            continue;
          }

          const clones: VectorRecord[] = canonicalRecords.map((r) => ({
            id: `${dup.documentId}::${r.chunkId}::${r.embeddingProvider ?? "default"}`,
            documentId: dup.documentId,
            chunkId: r.chunkId,
            text: r.text,
            embedding: r.embedding,
            metadata: {
              ...((r.metadata as Record<string, unknown>) ?? {}),
              businessId: r.businessId,
              embeddingProvider: r.embeddingProvider,
              source: "crawler",
              url: dup.page.url,
              contentHash: dup.page.contentHash,
              pageStatus: "duplicate",
              lastCrawledAt: crawledAt,
              duplicateOf: dup.canonicalDocumentId,
            },
          }));

          await this.vectorStore.upsert(clones);
          chunkCount += clones.length;

          existingHashByDoc.set(dup.documentId, dup.page.contentHash);
          existingVersionByDoc.set(dup.documentId, EXTRACTION_VERSION);
          existingChunkCountByDoc.set(dup.documentId, clones.length);
        }
      }

      // Every page in this batch is now either indexed, confirmed
      // unchanged, or cloned as a duplicate — safe to drop from
      // CrawledPage. A duplicate skipped above (its canonical hadn't
      // landed yet) stays put and is retried on the next batch/run.
      const retryIds = new Set(
        duplicatePages.filter((d) => canonicalMissing.has(d.documentId)).map((d) => d.page.id)
      );
      const toDelete = pending.filter((p) => !retryIds.has(p.id)).map((p) => p.id);
      if (toDelete.length > 0) {
        await prisma.crawledPage.deleteMany({ where: { id: { in: toDelete } } });
      }

      pagesProcessed += toDelete.length;
      await prisma.crawlTarget.update({ where: { id }, data: { pagesIndexed: pagesProcessed } });
    }

    const updated = await prisma.crawlTarget.update({
      where: { id },
      data: {
        status: "done",
        frontierJson: null,
        pagesIndexed: pagesProcessed,
        lastCrawledAt: new Date(),
        lastPageCount: (isFreshStart ? 0 : priorPageCount) + pagesProcessed,
        lastChunkCount: (isFreshStart ? 0 : priorChunkCount) + chunkCount,
        lastError: null,
      },
    });

    return toSummary(updated);
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
