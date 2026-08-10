import { RefreshScheduleService, MasterCsvService } from "@ai-chat-platform/knowledge-refresh";
import { TenantService } from "@ai-chat-platform/tenant";
import { CrawlerService } from "@ai-chat-platform/web-crawler";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";

// Matches auto-heal's STUCK_CRAWLING_MS — a target frozen in "crawling"
// this long with no progress write is dead, not just slow.
const STUCK_CRAWLING_MS = 15 * 60 * 1000;

export interface BusinessKnowledgeStatus {
  businessId: string;
  businessName: string;
  crawlTargets: { total: number; done: number; stuck: number };
  documentCount: number;
  masterCsv: { updatedAt: string | null; sourceCount: number };
  lastRunAt: string | null;
}

export class KnowledgeRefreshController {
  constructor(
    private readonly schedule: RefreshScheduleService,
    private readonly masterCsv: MasterCsvService,
    private readonly tenants: TenantService,
    private readonly crawler: CrawlerService,
    private readonly vectorStore: VectorStoreManager
  ) {}

  getSchedule(businessId: string) {
    return this.schedule.get(businessId);
  }

  setSchedule(businessId: string, hourBd: number) {
    return this.schedule.save(businessId, hourBd);
  }

  getMasterCsv(businessId: string) {
    return this.masterCsv.get(businessId);
  }

  /** businessIds due for a refresh at the given Bangladesh-time hour —
   * backs the hourly cron route. */
  getDue(currentHourBd: number) {
    return this.schedule.getDue(currentHourBd);
  }

  /** Fire-and-forget from the route's point of view — a full refresh
   * (recrawl + reprocess every upload) can genuinely take minutes, and
   * the owner explicitly said that's fine. The route responds
   * immediately; the dashboard polls getMasterCsv/getSchedule for
   * lastRunAt to see when it's done. */
  runRefreshNow(businessId: string) {
    return this.masterCsv.refresh(businessId);
  }

  /** Fires a full refresh for every business on the platform — same
   * fire-and-forget reasoning as runRefreshNow, just for all of them at
   * once. Caller (the route) doesn't await these individually; each
   * business's refresh runs independently so one business's failure or
   * slowness doesn't hold up any other. */
  async runRefreshAll(): Promise<{ started: number; businessIds: string[] }> {
    const businesses = await this.tenants.listAll();
    const businessIds = businesses.map((b) => b.id);

    for (const id of businessIds) {
      this.masterCsv.refresh(id).catch(() => {});
    }

    return { started: businessIds.length, businessIds };
  }

  /** Platform-wide view of "is every client's knowledge base actually
   * fully crawled, uploaded, and reflected in its master CSV" — the
   * question a raw "Last run: <timestamp>" can't answer on its own. */
  async getAllStatus(): Promise<BusinessKnowledgeStatus[]> {
    const businesses = await this.tenants.listAll();
    const allTargets = await this.crawler.listTargets();

    return Promise.all(
      businesses.map(async (business) => {
        const targets = allTargets.filter((t) => t.businessId === business.id);
        const done = targets.filter((t) => t.status === "done").length;
        const stuck = targets.filter(
          (t) => t.status === "crawling" && Date.now() - new Date(t.updatedAt).getTime() > STUCK_CRAWLING_MS
        ).length;

        const chunks = await this.vectorStore.listAllChunksForBusiness(business.id);
        const documentCount = new Set(chunks.map((c) => c.documentId)).size;

        const [csv, schedule] = await Promise.all([
          this.masterCsv.get(business.id),
          this.schedule.get(business.id),
        ]);

        const sourceCount = csv ? (csv.content.match(/^# Source: /gm) ?? []).length : 0;

        return {
          businessId: business.id,
          businessName: business.name,
          crawlTargets: { total: targets.length, done, stuck },
          documentCount,
          masterCsv: { updatedAt: csv?.updatedAt ?? null, sourceCount },
          lastRunAt: schedule.lastRunAt,
        };
      })
    );
  }
}
