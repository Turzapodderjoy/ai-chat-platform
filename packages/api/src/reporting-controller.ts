import { ReportingService } from "@ai-chat-platform/reporting";

export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  getOverview(businessId?: string, from?: Date, to?: Date) {
    return this.reporting.getOverview(businessId, from, to);
  }

  getInventoryUsage(businessId: string, from?: Date, to?: Date) {
    return this.reporting.getInventoryUsage(businessId, from, to);
  }

  getPartsUsage(businessId?: string, from?: Date, to?: Date) {
    return this.reporting.getPartsUsage(businessId, from, to);
  }
}
