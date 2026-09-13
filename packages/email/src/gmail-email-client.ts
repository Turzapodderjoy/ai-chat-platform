import nodemailer from "nodemailer";
import { GmailSenderConfigService } from "./gmail-sender-config-service";

function buildMultipartEmail(input: GmailSendInput, from: string): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const parts = [
    `To: ${input.to}`,
    `From: ${from}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    input.html,
    "",
  ];
  for (const att of input.attachments ?? []) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.contentType}; name="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "",
      att.content.toString("base64").replace(/(.{76})/g, "$1\r\n"),
      ""
    );
  }
  parts.push(`--${boundary}--`);
  return parts.join("\r\n");
}

export interface GmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface GmailSendInput {
  to: string;
  subject: string;
  html: string;
  attachments?: GmailAttachment[];
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

    // Build the raw email message in RFC 2822 format. Plain single-part
    // when there's nothing to attach; multipart/mixed (html part +
    // base64 attachment parts) otherwise -- the Gmail API's "raw" field
    // takes a full MIME message either way, there's no separate
    // attachments field like nodemailer's convenience API.
    const rawEmail = !input.attachments?.length
      ? [
          `To: ${input.to}`,
          `From: ${config.gmailAddress}`,
          `Subject: ${input.subject}`,
          "MIME-Version: 1.0",
          "Content-Type: text/html; charset=UTF-8",
          "",
          input.html,
        ].join("\r\n")
      : buildMultipartEmail(input, config.gmailAddress!);

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
        attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
