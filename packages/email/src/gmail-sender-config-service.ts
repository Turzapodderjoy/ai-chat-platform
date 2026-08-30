import { prisma } from "@ai-chat-platform/database";

export interface GmailSenderConfig {
  businessId: string;
  gmailAddress: string | null;
  appPassword: string | null;
}

export interface GmailSenderConfigInput {
  gmailAddress: string;
  appPassword: string;
}

/** Per-business Gmail sender identity, connected via an App Password
 * instead of OAuth -- same "single mutable row, null means not
 * configured" shape as EmailSenderConfigService. */
export class GmailSenderConfigService {
  async get(businessId: string): Promise<GmailSenderConfig> {
    const row = await prisma.gmailSenderConfig.findUnique({ where: { businessId } });
    if (!row) return { businessId, gmailAddress: null, appPassword: null };
    return { businessId: row.businessId, gmailAddress: row.gmailAddress, appPassword: row.appPassword };
  }

  async save(businessId: string, input: GmailSenderConfigInput): Promise<GmailSenderConfig> {
    const row = await prisma.gmailSenderConfig.upsert({
      where: { businessId },
      create: { businessId, ...input },
      update: { ...input },
    });
    return { businessId: row.businessId, gmailAddress: row.gmailAddress, appPassword: row.appPassword };
  }

  async disconnect(businessId: string): Promise<void> {
    await prisma.gmailSenderConfig.deleteMany({ where: { businessId } });
  }
}
