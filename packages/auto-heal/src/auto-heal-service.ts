import { prisma } from "@ai-chat-platform/database";
import { TenantService } from "@ai-chat-platform/tenant";
import { IndexingService } from "@ai-chat-platform/indexing";
import { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import { CrawlerService } from "@ai-chat-platform/web-crawler";

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * ONE_HOUR_MS;

// A target stuck in "crawling" OR "embedding" this long with no progress
// write is dead — the process that was running it (killed mid-crawl by its
// own execution-time limit, or a pm2 restart) is gone and will never reach
// "done" or "error" on its own; nothing else marks it stale. Both phases
// use the same threshold and the same runCrawl() resume path — runCrawl()
// already skips straight back into indexPhase when status is "embedding"
// (see crawler-service.ts), so retrying either status here is the same
// call, just gated on a different starting status.
const STUCK_CRAWLING_MS = 15 * 60 * 1000;

function nextBackoff(retryCount: number): Date {
  const delay = Math.min(ONE_HOUR_MS * 2 ** retryCount, MAX_BACKOFF_MS);
  return new Date(Date.now() + delay);
}

export interface AutoHealResult {
  id: string;
  status: "succeeded" | "failed";
  businessesChecked: number;
  providersBackfilled: number;
  crawlTargetsRetried: number;
  error?: string;
}

/** Runs on a schedule (every 30 minutes, see apps/web/app/api/cron/
 * auto-heal/route.ts) or manually from the dashboard. Checks exactly the
 * three things known to actually go wrong in this app — incomplete
 * embedding coverage, errored crawl targets, unusable API keys — and
 * retries the ones that are actually fixable by retrying, each gated by
 * its own cooldown so a frequent check doesn't turn into a frequent
 * hammering of a still-broken provider/target. */
export class AutoHealService {
  constructor(
    private readonly crawler: CrawlerService,
    private readonly indexing: IndexingService,
    private readonly embeddings: EmbeddingManager,
    private readonly tenants: TenantService
  ) {}

  async run(triggeredBy: "cron" | "manual"): Promise<AutoHealResult> {
    const run = await prisma.autoHealRun.create({
      data: { triggeredBy, status: "running" },
    });

    let businessesChecked = 0;
    let providersBackfilled = 0;
    let crawlTargetsRetried = 0;

    try {
      businessesChecked = await this.healEmbeddingCoverage((n) => {
        providersBackfilled += n;
      });

      crawlTargetsRetried = await this.healCrawlTargets();

      await prisma.autoHealRun.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          businessesChecked,
          providersBackfilled,
          crawlTargetsRetried,
        },
      });

      return {
        id: run.id,
        status: "succeeded",
        businessesChecked,
        providersBackfilled,
        crawlTargetsRetried,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);

      await prisma.autoHealRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error,
          businessesChecked,
          providersBackfilled,
          crawlTargetsRetried,
        },
      });

      return {
        id: run.id,
        status: "failed",
        businessesChecked,
        providersBackfilled,
        crawlTargetsRetried,
        error,
      };
    }
  }

  /** Checks every business's embedding coverage; backfills any provider
   * that's under 100%, actually fixable (enabled + has a usable key —
   * retrying a missing key is a human action, not something this can
   * resolve), and past its own cooldown. Returns the number of
   * businesses checked; reports how many providers it backfilled via
   * the callback. */
  private async healEmbeddingCoverage(
    onBackfilled: (count: number) => void
  ): Promise<number> {
    const businesses = await this.tenants.listAll();
    const providerStatus = new Map(
      this.embeddings.getProviderStatus().map((s) => [s.name.toLowerCase(), s])
    );

    for (const business of businesses) {
      const coverage = await this.indexing.coverageStatus(business.id);

      for (const entry of coverage) {
        if (entry.chunksEmbedded >= entry.totalChunks || entry.totalChunks === 0) {
          continue;
        }

        const status = providerStatus.get(entry.provider.toLowerCase());
        if (!status?.enabled || !status.hasUsableKey) {
          continue;
        }

        const cooldown = await prisma.embeddingBackfillCooldown.findUnique({
          where: { businessId_provider: { businessId: business.id, provider: entry.provider } },
        });

        if (cooldown?.nextRetryAt && cooldown.nextRetryAt > new Date()) {
          continue;
        }

        const result = await this.indexing.backfillProvider(business.id, entry.provider);
        const stillIncomplete = result.vectorsAdded === 0 || result.chunksBackfilled < entry.totalChunks - entry.chunksEmbedded;
        const nextRetryCount = stillIncomplete ? (cooldown?.retryCount ?? 0) + 1 : 0;

        await prisma.embeddingBackfillCooldown.upsert({
          where: { businessId_provider: { businessId: business.id, provider: entry.provider } },
          create: {
            businessId: business.id,
            provider: entry.provider,
            retryCount: nextRetryCount,
            nextRetryAt: stillIncomplete ? nextBackoff(0) : null,
          },
          update: {
            retryCount: nextRetryCount,
            nextRetryAt: stillIncomplete ? nextBackoff(nextRetryCount - 1) : null,
          },
        });

        onBackfilled(1);
      }
    }

    return businesses.length;
  }

  /** Retries any crawl target in status:"error" whose cooldown has
   * passed, plus any target stuck in status:"crawling" OR "embedding" for
   * too long (the process running it died — crashed, or a pm2 restart —
   * without ever writing "done" or "error"; a background refresh job is
   * in-memory only and does not survive that, see STUCK_CRAWLING_MS).
   * Calls runCrawl() directly rather
   * than resetting via queueForCrawl() first — runCrawl() now resumes
   * from CrawlTarget.frontierJson when one exists (a large site's crawl
   * spans many batches; see MAX_PAGES_PER_BATCH), so a full reset here
   * would wipe out however many batches of progress already landed and
   * make this loop retry from the site's root every 15+ minutes forever
   * instead of ever finishing. Deliberately doesn't use
   * CrawlerService.crawlAll() (which re-crawls everything regardless of
   * status — that's the separate daily crawl cron's job). */
  private async healCrawlTargets(): Promise<number> {
    const targets = await prisma.crawlTarget.findMany({
      where: {
        OR: [
          { status: "error", OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }] },
          { status: "crawling", updatedAt: { lte: new Date(Date.now() - STUCK_CRAWLING_MS) } },
          { status: "embedding", updatedAt: { lte: new Date(Date.now() - STUCK_CRAWLING_MS) } },
        ],
      },
    });

    let retried = 0;

    for (const target of targets) {
      const result = await this.crawler.runCrawl(target.id);
      retried += 1;

      if (result.status === "error") {
        const retryCount = target.retryCount + 1;
        await prisma.crawlTarget.update({
          where: { id: target.id },
          data: { retryCount, nextRetryAt: nextBackoff(retryCount - 1) },
        });
      } else {
        await prisma.crawlTarget.update({
          where: { id: target.id },
          data: { retryCount: 0, nextRetryAt: null },
        });
      }
    }

    return retried;
  }
}
