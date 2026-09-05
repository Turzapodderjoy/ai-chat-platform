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

/** Sends through a business's own Gmail account. Supports two auth modes:
 *  1. OAuth (Google sign-in): Uses Gmail API with stored access/refresh tokens
 *  2. App Password (manual): Uses SMTP with nodemailer
 * Per-business only, same as every other client-scoped sender config. */
export class GmailEmailClient {
  constructor(private readonly senderConfig: GmailSenderConfigService) {}

  async send(businessId: string, input: GmailSendInput): Promise<GmailSendResult> {
    const config = await this.senderConfig.get(businessId);

    // Prefer OAuth if tokens exist
    if (config.accessToken) {
      return this.sendViaOAuth(businessId, config, input);
    }

    // Fall back to App Password SMTP
    if (config.gmailAddress && config.appPassword) {
      return this.sendViaSmtp(config, input);
    }

    return { ok: false, error: "not_connected" };
  }

  /** Send via Gmail API using OAuth tokens. */
  private async sendViaOAuth(
    businessId: string,
    config: { gmailAddress: string | null; accessToken: string | null; refreshToken: string | null },
    input: GmailSendInput
  ): Promise<GmailSendResult> {
    let accessToken = config.accessToken!;

    // Build the raw email message in RFC 2822 format
    const rawEmail = [
      `To: ${input.to}`,
      `From: ${config.gmailAddress}`,
      `Subject: ${input.subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "",
      input.html,
    ].join("\r\n");

    // Base64url encode
    const encodedMessage = Buffer.from(rawEmail)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    let res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });

    // If 401, try refreshing the access token
    if (res.status === 401 && config.refreshToken) {
      const newToken = await this.senderConfig.refreshAccessToken(businessId);
      if (newToken) {
        accessToken = newToken;
        res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encodedMessage }),
        });
      }
    }

    if (res.ok) {
      return { ok: true };
    }

    const body = await res.text();
    return { ok: false, error: `Gmail API error ${res.status}: ${body}` };
  }

  /** Send via SMTP using App Password. */
  private async sendViaSmtp(
    config: { gmailAddress: string | null; appPassword: string | null },
    input: GmailSendInput
  ): Promise<GmailSendResult> {
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
