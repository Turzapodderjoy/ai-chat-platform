import { GmailSenderConfigService, type GmailSenderConfigInput } from "@ai-chat-platform/email";

export class GmailSenderConfigController {
  constructor(private readonly senderConfig: GmailSenderConfigService) {}

  get(businessId: string) {
    return this.senderConfig.get(businessId);
  }

  save(businessId: string, input: GmailSenderConfigInput) {
    return this.senderConfig.save(businessId, input);
  }

  disconnect(businessId: string) {
    return this.senderConfig.disconnect(businessId);
  }
}
