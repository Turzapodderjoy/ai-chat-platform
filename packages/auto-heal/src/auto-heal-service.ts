import { prisma } from "@ai-chat-platform/database";
import { TenantService } from "@ai-chat-platform/tenant";
import { IndexingService } from "@ai-chat-platform/indexing";
import { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import { CrawlerService } from "@ai-chat-platform/web-crawler";

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * ONE_HOUR_MS;

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
   * passed. Deliberately queries only status:"error" targets, not
   * CrawlerService.crawlAll() (which re-crawls everything regardless of
   * status — that's the separate daily crawl cron's job). */
  private async healCrawlTargets(): Promise<number> {
    const targets = await prisma.crawlTarget.findMany({
      where: {
        status: "error",
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
    });

    let retried = 0;

    for (const target of targets) {
      await this.crawler.queueForCrawl(target.id);
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
