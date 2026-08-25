import { EmailSenderConfigService, type EmailSenderConfigInput } from "@ai-chat-platform/email";

export class EmailController {
  constructor(private readonly emailSenderConfig: EmailSenderConfigService) {}

  getSenderConfig(businessId: string) {
    return this.emailSenderConfig.get(businessId);
  }

  saveSenderConfig(businessId: string, input: EmailSenderConfigInput) {
    return this.emailSenderConfig.save(businessId, input);
  }
}
