import { prisma } from "@ai-chat-platform/database";

export interface EmailSenderConfig {
  businessId: string;
  fromName: string | null;
  fromEmail: string | null;
  trackingPageUrl: string | null;
}

export interface EmailSenderConfigInput {
  fromName: string;
  fromEmail: string;
  trackingPageUrl?: string;
}

/** Per-business outbound-email sender identity — same shape as
 * WidgetConfigService (single mutable row, sane empty default before
 * any row exists). A null fromEmail means "not configured yet", which
 * callers treat as "skip sending" rather than an error. */
export class EmailSenderConfigService {
  async get(businessId: string): Promise<EmailSenderConfig> {
    const row = await prisma.emailSenderConfig.findUnique({ where: { businessId } });
    if (!row) return { businessId, fromName: null, fromEmail: null, trackingPageUrl: null };

    return {
      businessId: row.businessId,
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      trackingPageUrl: row.trackingPageUrl,
    };
  }

  async save(businessId: string, input: EmailSenderConfigInput): Promise<EmailSenderConfig> {
    const row = await prisma.emailSenderConfig.upsert({
      where: { businessId },
      create: { businessId, ...input },
      update: { ...input },
    });

    return this.get(row.businessId);
  }
}
