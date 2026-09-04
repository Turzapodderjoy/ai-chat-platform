import { ReportingService } from "@ai-chat-platform/reporting";

export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  getOverview(businessId?: string, from?: Date, to?: Date) {
    return this.reporting.getOverview(businessId, from, to);
  }
}
