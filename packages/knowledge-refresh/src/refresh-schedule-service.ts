import { prisma } from "@ai-chat-platform/database";

export interface RefreshSchedule {
  businessId: string;
  hourBd: number | null;
  lastRunAt: string | null;
  buildingCsv: boolean;
}

/** Same single-mutable-row-per-business shape as WidgetConfigService —
 * a schedule time has no need for AiConfigVersion's append-only history. */
export class RefreshScheduleService {
  async get(businessId: string): Promise<RefreshSchedule> {
    const row = await prisma.knowledgeRefreshSchedule.findUnique({ where: { businessId } });
    if (!row) return { businessId, hourBd: null, lastRunAt: null, buildingCsv: false };

    return {
      businessId: row.businessId,
      hourBd: row.hourBd,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      buildingCsv: row.buildingCsv,
    };
  }

  /** Marks the span between "every crawl target is embedded" and "the
   * master CSV row is rebuilt" — the one refresh phase with no
   * CrawlTarget row of its own to report status from. */
  async setBuildingCsv(businessId: string, building: boolean): Promise<void> {
    await prisma.knowledgeRefreshSchedule.upsert({
      where: { businessId },
      create: { businessId, hourBd: 23, buildingCsv: building },
      update: { buildingCsv: building },
    });
  }

  async save(businessId: string, hourBd: number): Promise<RefreshSchedule> {
    if (!Number.isInteger(hourBd) || hourBd < 0 || hourBd > 23) {
      throw new Error("hourBd must be an integer 0-23 (Bangladesh time).");
    }

    await prisma.knowledgeRefreshSchedule.upsert({
      where: { businessId },
      create: { businessId, hourBd },
      update: { hourBd },
    });

    return this.get(businessId);
  }

  async markRun(businessId: string): Promise<void> {
    // "Run now" can fire before any schedule time was ever saved for this
    // business — upsert so lastRunAt still gets stamped instead of throwing
    // "Record not found" and silently vanishing two layers up.
    await prisma.knowledgeRefreshSchedule.upsert({
      where: { businessId },
      create: { businessId, hourBd: 23, lastRunAt: new Date() },
      update: { lastRunAt: new Date() },
    });
  }

  /** businessIds whose configured hour matches the given current
   * Bangladesh-time hour — backs the hourly cron check. */
  async getDue(currentHourBd: number): Promise<string[]> {
    const rows = await prisma.knowledgeRefreshSchedule.findMany({
      where: { hourBd: currentHourBd },
      select: { businessId: true },
    });
    return rows.map((r) => r.businessId);
  }

  /** businessIds whose CSV rebuild has been "in progress" longer than
   * staleMs with no write to prove it — the process that was building it
   * died (crash, pm2 restart) and buildingCsv would otherwise stay true
   * forever, since only the finally-block in MasterCsvService.refresh()
   * ever clears it. Backs auto-heal's resume check. */
  async getStuckBuildingCsv(staleMs: number): Promise<string[]> {
    const rows = await prisma.knowledgeRefreshSchedule.findMany({
      where: { buildingCsv: true, updatedAt: { lte: new Date(Date.now() - staleMs) } },
      select: { businessId: true },
    });
    return rows.map((r) => r.businessId);
  }
}
