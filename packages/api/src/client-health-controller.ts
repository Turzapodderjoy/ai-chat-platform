import { prisma } from "@ai-chat-platform/database";
import { TenantService } from "@ai-chat-platform/tenant";
import { CrawlerService } from "@ai-chat-platform/web-crawler";
import { MasterCsvService, RefreshScheduleService } from "@ai-chat-platform/knowledge-refresh";
import { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import { ConversationService } from "@ai-chat-platform/conversation";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";

// Matches auto-heal's STUCK_CRAWLING_MS.
const STUCK_CRAWLING_MS = 15 * 60 * 1000;
const USAGE_WINDOW_DAYS = 7;

export interface ClientHealthRow {
  businessId: string;
  businessName: string;
  crawlTargets: { total: number; done: number; stuck: number };
  // The live "crawled done / embedding / building csv" status a refresh
  // run moves through, in order — null when nothing is in progress.
  refreshPhase:
    | { phase: "crawling"; pagesDone: number; pagesEstimated: number; queueRemaining: number | null }
    | { phase: "embedding"; pagesIndexed: number; pagesTotal: number }
    | { phase: "building_csv" }
    | null;
  documentCount: number;
  productCount: number;
  masterCsv: { updatedAt: string | null; sourceCount: number };
  lastRefreshAt: string | null;
  embeddingCoverage: Array<{ provider: string; pct: number }>;
  openHandoffs: number;
  totalConversations: number;
  providerUsage: Array<{ provider: string; count: number }>;
}

/** One consolidated "is this client actually healthy" view — everything
 * a platform operator would otherwise have to check across five
 * different tabs (Knowledge Hub, Embedding Providers, Handoffs, All
 * Chats, Usage) for every business, one at a time. */
export class ClientHealthController {
  constructor(
    private readonly tenants: TenantService,
    private readonly crawler: CrawlerService,
    private readonly masterCsv: MasterCsvService,
    private readonly schedule: RefreshScheduleService,
    private readonly vectorStore: VectorStoreManager,
    private readonly embeddings: EmbeddingManager,
    private readonly conversations: ConversationService
  ) {}

  async getAll(): Promise<ClientHealthRow[]> {
    const businesses = await this.tenants.listAll();
    const allTargets = await this.crawler.listTargets();

    // ONE full vector-table scan shared across every business's document
    // count AND embedding coverage below. Looping IndexingService-style
    // coverageStatus() once per business would each independently re-scan
    // the WHOLE table — measurably contends with the DB under real crawl
    // load (confirmed live: this endpoint's per-business sibling,
    // getAllStatus, timed out while a large crawl was writing).
    const allRecords = await this.vectorStore.listAll();
    const providerNames = this.embeddings.getProviderNames();

    const productCounts = await prisma.product.groupBy({ by: ["businessId"], _count: { id: true } });
    const productCountByBusiness = new Map(productCounts.map((p) => [p.businessId, p._count.id]));

    const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recentAssistantMessages = await prisma.message.findMany({
      where: { role: "assistant", createdAt: { gte: since } },
      select: { provider: true, conversation: { select: { businessId: true } } },
    });

    return Promise.all(
      businesses.map(async (business) => {
        const targets = allTargets.filter((t) => t.businessId === business.id);
        const done = targets.filter((t) => t.status === "done").length;
        const stuck = targets.filter(
          (t) =>
            (t.status === "crawling" || t.status === "embedding") &&
            Date.now() - new Date(t.updatedAt).getTime() > STUCK_CRAWLING_MS
        ).length;
        const crawling = targets.filter((t) => t.status === "crawling");
        const embedding = targets.filter((t) => t.status === "embedding");

        const scoped = allRecords.filter((r) => r.metadata?.businessId === business.id);
        const byChunk = new Map<string, typeof scoped>();
        for (const record of scoped) {
          const key = `${record.documentId}::${record.chunkId}`;
          const list = byChunk.get(key) ?? [];
          list.push(record);
          byChunk.set(key, list);
        }
        const documentCount = new Set(scoped.map((r) => r.documentId)).size;
        const totalChunks = byChunk.size;

        // A disabled provider was never going to embed anything and never
        // will until re-enabled — counting it here just shows a permanent,
        // unactionable warning (confirmed live: jina disabled, sitting at
        // 1% coverage forever) instead of reflecting the providers this
        // business is actually relying on.
        const embeddingCoverage = providerNames.filter((p) => this.embeddings.isProviderEnabled(p)).map((provider) => {
          let embedded = 0;
          for (const records of byChunk.values()) {
            if (records.some((r) => (r.metadata?.embeddingProvider ?? "jina") === provider)) {
              embedded++;
            }
          }
          return { provider, pct: totalChunks === 0 ? 100 : Math.round((embedded / totalChunks) * 100) };
        });

        const [csv, sched, handoffs, totalConversations] = await Promise.all([
          this.masterCsv.get(business.id),
          this.schedule.get(business.id),
          this.conversations.listHandoffs(business.id),
          this.conversations.countConversations(business.id),
        ]);

        const sourceCount = csv ? (csv.content.match(/^# Source: /gm) ?? []).length : 0;

        // Order matters: a business only ever has one phase active at a
        // time (runCrawl() fully finishes crawling+embedding a target
        // before refresh() moves to the next, and CSV building only
        // starts once every target is done) — check in pipeline order.
        const refreshPhase: ClientHealthRow["refreshPhase"] =
          crawling.length > 0
            ? {
                phase: "crawling",
                pagesDone: crawling.reduce((sum, t) => sum + t.pagesDone, 0),
                pagesEstimated: crawling.reduce((sum, t) => sum + (t.pagesEstimated ?? 0), 0),
                // null only if EVERY crawling target somehow has no
                // frontier (shouldn't happen while status is "crawling",
                // but avoids claiming "0 remaining" if it ever does).
                queueRemaining: crawling.some((t) => t.queueRemaining !== null)
                  ? crawling.reduce((sum, t) => sum + (t.queueRemaining ?? 0), 0)
                  : null,
              }
            : embedding.length > 0
              ? {
                  phase: "embedding",
                  pagesIndexed: embedding.reduce((sum, t) => sum + t.pagesIndexed, 0),
                  pagesTotal: embedding.reduce((sum, t) => sum + t.pagesDone, 0),
                }
              : sched.buildingCsv
                ? { phase: "building_csv" }
                : null;

        const usageTally = new Map<string, number>();
        for (const m of recentAssistantMessages) {
          if (m.conversation.businessId !== business.id) continue;
          const key = m.provider ?? "unknown";
          usageTally.set(key, (usageTally.get(key) ?? 0) + 1);
        }
        const providerUsage = Array.from(usageTally.entries())
          .map(([provider, count]) => ({ provider, count }))
          .sort((a, b) => b.count - a.count);

        return {
          businessId: business.id,
          businessName: business.name,
          crawlTargets: { total: targets.length, done, stuck },
          refreshPhase,
          documentCount,
          productCount: productCountByBusiness.get(business.id) ?? 0,
          masterCsv: { updatedAt: csv?.updatedAt ?? null, sourceCount },
          lastRefreshAt: sched.lastRunAt,
          embeddingCoverage,
          openHandoffs: handoffs.filter((h) => h.handoffStatus === "pending").length,
          totalConversations,
          providerUsage,
        };
      })
    );
  }
}
