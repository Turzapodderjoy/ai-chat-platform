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
  crawlProgress: { pagesDone: number; pagesEstimated: number } | null;
  documentCount: number;
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
          (t) => t.status === "crawling" && Date.now() - new Date(t.updatedAt).getTime() > STUCK_CRAWLING_MS
        ).length;
        const crawling = targets.filter((t) => t.status === "crawling");
        const crawlProgress =
          crawling.length === 0
            ? null
            : {
                pagesDone: crawling.reduce((sum, t) => sum + t.pagesDone, 0),
                pagesEstimated: crawling.reduce((sum, t) => sum + (t.pagesEstimated ?? 0), 0),
              };

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

        const embeddingCoverage = providerNames.map((provider) => {
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
          crawlProgress,
          documentCount,
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
