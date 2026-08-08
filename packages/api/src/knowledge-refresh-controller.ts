import { RefreshScheduleService, MasterCsvService } from "@ai-chat-platform/knowledge-refresh";

export class KnowledgeRefreshController {
  constructor(
    private readonly schedule: RefreshScheduleService,
    private readonly masterCsv: MasterCsvService
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
}
