import nodemailer from "nodemailer";
import { GmailSenderConfigService } from "./gmail-sender-config-service";

export interface GmailSendInput {
  to: string;
  subject: string;
  html: string;
}

export interface GmailSendResult {
  ok: boolean;
  error?: string;
}

/** Sends through a business's own Gmail account over SMTP, authenticated
 * with an App Password (Google Account -> Security -> App Passwords) --
 * no OAuth, no Google Cloud project, no platform-wide app credential.
 * Per-business only, same as every other client-scoped sender config in
 * this codebase. The free alternative to ResendEmailClient's
 * paid-past-free-tier API, used exclusively by StatusEmailService. */
export class GmailEmailClient {
  constructor(private readonly senderConfig: GmailSenderConfigService) {}

  async send(businessId: string, input: GmailSendInput): Promise<GmailSendResult> {
    const config = await this.senderConfig.get(businessId);
    if (!config.gmailAddress || !config.appPassword) {
      return { ok: false, error: "not_connected" };
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: config.gmailAddress, pass: config.appPassword },
    });

    try {
      await transporter.sendMail({
        from: config.gmailAddress,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
