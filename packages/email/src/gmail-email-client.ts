import { ChannelConnectionService, ChannelAppCredentialService } from "@ai-chat-platform/channel-connections";

export interface GmailSendInput {
  to: string;
  subject: string;
  html: string;
}

export interface GmailSendResult {
  ok: boolean;
  error?: string;
}

/** Sends through a business's own connected Gmail account (see
 * packages/channel-catalog/src/providers/gmail.ts for the OAuth side) --
 * the free alternative to ResendEmailClient's paid-past-free-tier API,
 * used exclusively by StatusEmailService for status-change notifications.
 * Reuses the ChannelConnection row Gmail was registered against as just
 * another "channel" (refreshToken/expiresAt live in its `config` JSON, the
 * one field Meta channels never needed since their tokens don't expire on
 * this timescale). */
export class GmailEmailClient {
  constructor(
    private readonly connections: ChannelConnectionService,
    private readonly appCredentials: ChannelAppCredentialService
  ) {}

  async send(businessId: string, input: GmailSendInput): Promise<GmailSendResult> {
    const connection = await this.connections.forBusinessAndChannel(businessId, "gmail");
    if (!connection) return { ok: false, error: "not_connected" };

    let accessToken = connection.accessToken;
    const config = (connection.config ?? {}) as { refreshToken?: string; expiresAt?: number };

    if (config.expiresAt && Date.now() >= config.expiresAt) {
      const refreshed = await this.refresh(businessId, connection.externalId, connection.externalLabel, config.refreshToken);
      if (!refreshed) return { ok: false, error: "refresh_failed" };
      accessToken = refreshed;
    }

    const raw = buildRawMessage(connection.externalId, input.to, input.subject, input.html);

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      return { ok: false, error: `${res.status} ${await res.text()}` };
    }

    return { ok: true };
  }

  private async refresh(
    businessId: string,
    externalId: string,
    externalLabel: string,
    refreshToken: string | undefined
  ): Promise<string | null> {
    if (!refreshToken) return null;

    const app = await this.appCredentials.get("gmail");
    if (!app) return null;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: app.appId,
        client_secret: app.appSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) return null;

    const token = (await res.json()) as { access_token: string; expires_in: number };

    await this.connections.upsert({
      businessId,
      channel: "gmail",
      externalId,
      externalLabel,
      accessToken: token.access_token,
      config: { refreshToken, expiresAt: Date.now() + token.expires_in * 1000 },
    });

    return token.access_token;
  }
}

function buildRawMessage(from: string, to: string, subject: string, html: string): string {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
