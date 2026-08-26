import { ReportingService } from "@ai-chat-platform/reporting";

export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  getOverview(businessId?: string) {
    return this.reporting.getOverview(businessId);
  }
}
