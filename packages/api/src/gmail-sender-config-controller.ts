import { GmailSenderConfigService, type GmailSenderConfigInput } from "@ai-chat-platform/email";
import type { TenantService } from "@ai-chat-platform/tenant";

export class GmailSenderConfigController {
  constructor(
    private readonly senderConfig: GmailSenderConfigService,
    private readonly tenants: TenantService
  ) {}

  get(businessId: string) {
    return this.senderConfig.get(businessId);
  }

  async getWithTimezone(businessId: string) {
    const [config, business] = await Promise.all([
      this.senderConfig.get(businessId),
      this.tenants.getBusiness(businessId),
    ]);
    return {
      ...config,
      timezone: business?.timezone ?? "America/New_York",
    };
  }

  save(businessId: string, input: GmailSenderConfigInput) {
    return this.senderConfig.save(businessId, input);
  }

  async setTimezone(businessId: string, timezone: string) {
    await this.tenants.setTimezone(businessId, timezone);
  }

  disconnect(businessId: string) {
    return this.senderConfig.disconnect(businessId);
  }
}
