import { prisma } from "@ai-chat-platform/database";

export interface RefreshSchedule {
  businessId: string;
  hourBd: number | null;
  lastRunAt: string | null;
}

/** Same single-mutable-row-per-business shape as WidgetConfigService —
 * a schedule time has no need for AiConfigVersion's append-only history. */
export class RefreshScheduleService {
  async get(businessId: string): Promise<RefreshSchedule> {
    const row = await prisma.knowledgeRefreshSchedule.findUnique({ where: { businessId } });
    if (!row) return { businessId, hourBd: null, lastRunAt: null };

    return {
      businessId: row.businessId,
      hourBd: row.hourBd,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
    };
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
}
