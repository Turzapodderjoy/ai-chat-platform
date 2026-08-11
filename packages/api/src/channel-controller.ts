import {
  CHANNEL_CATALOG,
  createOrGetSession,
  startSession,
  getSession,
  getQrCode,
  registerWebhook,
} from "@ai-chat-platform/channel-catalog";
import { ChannelAppCredentialService, ChannelConnectionService } from "@ai-chat-platform/channel-connections";
import { RagService } from "@ai-chat-platform/rag";

/**
 * Per-client channel connections (website/Messenger/Instagram/WhatsApp)
 * plus the one-time platform-wide Meta App setup — same catalog-driven
 * shape as EmbeddingController. Also owns the OAuth start/callback and
 * webhook verify/inbound flows, which orchestrate the catalog adapter +
 * the connection store + the existing RagService (no new chat logic —
 * an inbound channel message is answered exactly the way the website
 * widget's /api/chat call is).
 */
export class ChannelController {
  constructor(
    private readonly channelConnections: ChannelConnectionService,
    private readonly appCredentials: ChannelAppCredentialService,
    private readonly rag: RagService
  ) {}

  catalog() {
    return CHANNEL_CATALOG.map((c) => ({
      id: c.id,
      label: c.label,
      requiresPlatformApp: c.requiresPlatformApp,
      supportsOAuth: !!c.buildConnectUrl,
    }));
  }

  connections(businessId: string) {
    return this.channelConnections.forBusiness(businessId);
  }

  embedSnippet(businessId: string, baseUrl: string) {
    const entry = CHANNEL_CATALOG.find((c) => c.id === "website");
    return { snippet: entry?.getEmbedSnippet?.(businessId, baseUrl) ?? "" };
  }

  /** Never returns appSecret to the browser — only whether one is set. */
  async platformAppCredentials() {
    const rows = await this.appCredentials.all();

    return CHANNEL_CATALOG.filter((c) => c.requiresPlatformApp || c.id === "whatsapp").map((c) => {
      const row = rows.find((r) => r.channel === c.id);
      return {
        channel: c.id,
        label: c.label,
        appId: row?.appId ?? "",
        hasSecret: !!row?.appSecret,
        webhookVerifyToken: row?.webhookVerifyToken ?? "",
      };
    });
  }

  async savePlatformAppCredential(channel: string, appId: string, appSecret: string, webhookVerifyToken: string) {
    if (!CHANNEL_CATALOG.some((c) => c.id === channel)) {
      throw new Error(`Unknown channel "${channel}".`);
    }

    if (!webhookVerifyToken.trim()) {
      throw new Error("Webhook verify token is required.");
    }

    // Blank App Secret in the form means "keep the current one" — the
    // dashboard never sends the real secret back down after saving, so
    // an empty submit must not clobber it.
    const finalSecret = appSecret.trim() || (await this.appCredentials.get(channel))?.appSecret || "";

    await this.appCredentials.set(channel, appId, finalSecret, webhookVerifyToken);
    return { saved: channel };
  }

  async disconnect(businessId: string, channel: string) {
    await this.channelConnections.disconnect(businessId, channel);
    return { disconnected: channel };
  }

  async connectWhatsapp(businessId: string, phoneNumberId: string, accessToken: string, businessAccountId?: string) {
    if (!phoneNumberId.trim() || !accessToken.trim()) {
      throw new Error("Phone Number ID and access token are required.");
    }

    await this.channelConnections.upsert({
      businessId,
      channel: "whatsapp",
      externalId: phoneNumberId.trim(),
      externalLabel: phoneNumberId.trim(),
      accessToken: accessToken.trim(),
      config: businessAccountId ? { businessAccountId } : null,
    });

    return { connected: "whatsapp" };
  }

  /** Creates (or reuses) this business's OpenWA session, starts it, and
   * registers the webhook that feeds inbound messages into the same RAG
   * pipeline as every other channel. Safe to call repeatedly — session
   * creation and webhook registration are both idempotent by name. The
   * connection isn't persisted here: it's only saved once the session
   * actually reaches "ready" (see confirmTestWhatsappConnected), so a
   * QR that's never scanned doesn't leave a fake "connected" row. */
  async createTestWhatsappSession(businessId: string, webhookBaseUrl: string) {
    const session = await createOrGetSession(businessId);
    await startSession(session.id).catch(() => {}); // already started is fine
    await registerWebhook(session.id, `${webhookBaseUrl}/api/webhooks/whatsapp-test`).catch(() => {});
    return { sessionId: session.id, status: session.status };
  }

  async testWhatsappQr(businessId: string) {
    const session = await createOrGetSession(businessId);
    const qrCode = await getQrCode(session.id);
    return { sessionId: session.id, status: session.status, qrCode };
  }

  /** Polled by the dashboard while the QR is on screen. Once the OpenWA
   * session reports "ready", persists the ChannelConnection so inbound
   * webhook messages resolve to this business. */
  async testWhatsappStatus(businessId: string) {
    const session = await getSession((await createOrGetSession(businessId)).id);

    if (session.status === "ready") {
      await this.channelConnections.upsert({
        businessId,
        channel: "whatsapp-test",
        externalId: session.id,
        externalLabel: session.phone ?? session.name,
        accessToken: process.env.OPENWA_API_KEY ?? "",
      });
    }

    return { sessionId: session.id, status: session.status, phone: session.phone };
  }

  async oauthStartUrl(channel: string, businessId: string, redirectUri: string): Promise<string> {
    const entry = CHANNEL_CATALOG.find((c) => c.id === channel);
    if (!entry?.buildConnectUrl) {
      throw new Error(`Channel "${channel}" doesn't support OAuth connect.`);
    }

    const cred = await this.appCredentials.get(channel);
    if (!cred?.appId) {
      throw new Error(
        `Platform app credentials for "${channel}" haven't been configured yet — set them up in the mother dashboard's Integrations tab first.`
      );
    }

    return entry.buildConnectUrl(businessId, redirectUri, cred.appId);
  }

  async oauthCallback(channel: string, code: string, businessId: string, redirectUri: string) {
    const entry = CHANNEL_CATALOG.find((c) => c.id === channel);
    if (!entry?.exchangeCodeForConnection) {
      throw new Error(`Channel "${channel}" doesn't support OAuth connect.`);
    }

    const cred = await this.appCredentials.get(channel);
    if (!cred?.appId || !cred.appSecret) {
      throw new Error(`Platform app credentials for "${channel}" aren't configured.`);
    }

    const result = await entry.exchangeCodeForConnection(code, cred, redirectUri);

    await this.channelConnections.upsert({
      businessId,
      channel,
      externalId: result.externalId,
      externalLabel: result.externalLabel,
      accessToken: result.accessToken,
      config: result.config ?? null,
    });

    return { connected: channel, label: result.externalLabel };
  }

  async webhookVerify(channel: string, query: URLSearchParams): Promise<string | null> {
    const entry = CHANNEL_CATALOG.find((c) => c.id === channel);
    if (!entry?.verifyWebhookChallenge) return null;

    const cred = await this.appCredentials.get(channel);
    if (!cred?.webhookVerifyToken) return null;

    return entry.verifyWebhookChallenge(query, cred.webhookVerifyToken);
  }

  async webhookEvent(channel: string, payload: unknown): Promise<void> {
    const entry = CHANNEL_CATALOG.find((c) => c.id === channel);
    if (!entry?.parseInboundMessage || !entry.sendMessage) return;

    const messages = entry.parseInboundMessage(payload);

    for (const msg of messages) {
      const connection = await this.channelConnections.findByExternalId(channel, msg.externalId);
      if (!connection) continue; // message for a Page/number not connected to any client

      const response = await this.rag.ask({
        sessionId: `${channel}:${connection.businessId}:${msg.senderId}`,
        message: msg.text,
        businessId: connection.businessId,
        channel,
        externalUserId: msg.senderId,
      });

      await entry.sendMessage(connection, msg.senderId, response.answer);
    }
  }
}
