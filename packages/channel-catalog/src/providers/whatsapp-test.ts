import type { ChannelAdapter, ChannelConnectionInfo, InboundMessage } from "../types";
import { sendTextMessage } from "./openwa-shared";

interface OpenWaWebhookPayload {
  event?: string;
  sessionId?: string;
  data?: {
    from?: string;
    body?: string;
    type?: string;
    fromMe?: boolean;
  };
}

/** Testing-only WhatsApp channel via a self-hosted OpenWA gateway
 * (github.com/rmyndharis/OpenWA, unofficial — whatsapp-web.js/Baileys
 * under the hood) instead of the official Meta Cloud API. Each business
 * links its own number by scanning a QR code (see
 * ChannelController.createTestWhatsappSession/testWhatsappQr) rather
 * than pasting a permanent token — no Meta Business Verification
 * needed, at the cost of real ban risk (see OpenWA's own README). */
export const whatsappTestAdapter: ChannelAdapter = {
  id: "whatsapp-test",
  label: "WhatsApp (testing, unofficial)",
  requiresPlatformApp: false,

  parseInboundMessage(payload: unknown): InboundMessage[] {
    const body = payload as OpenWaWebhookPayload;
    if (body.event !== "message.received") return [];

    const sessionId = body.sessionId;
    const from = body.data?.from;
    const text = body.data?.body;

    if (!sessionId || !from || !text || body.data?.fromMe) return [];
    if (body.data?.type && body.data.type !== "text") return [];

    return [{ externalId: sessionId, senderId: from, text }];
  },

  async sendMessage(connection: ChannelConnectionInfo, recipientId: string, text: string): Promise<void> {
    await sendTextMessage(connection.externalId, recipientId, text);
  },
};
