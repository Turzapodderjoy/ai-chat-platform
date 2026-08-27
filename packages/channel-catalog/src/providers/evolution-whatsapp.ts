import type { ChannelAdapter, ChannelConnectionInfo, InboundMessage } from "../types";
import { getBase64FromMediaMessage, sendHumanPacedMessage } from "./evolution-shared";

/** Baileys-native message shape, passed through by Evolution API's
 * MESSAGES_UPSERT webhook mostly as-is (confirmed via Evolution API's
 * own OpenAPI schema: `key`/`message`/`messageType`/`fromMe` fields) --
 * text lives in one of a few possible sub-fields depending on how the
 * customer's client sent it, so every known location is checked rather
 * than assuming one. An imageMessage's own `url`/`mediaKey` are
 * encrypted (Baileys client-side encryption) -- see
 * evolution-shared.ts's getBase64FromMediaMessage for the actual
 * decrypt path, keyed off this message's own id. */
interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: { caption?: string };
    };
    messageType?: string;
  };
}

/** Testing-only WhatsApp channel via a self-hosted Evolution API gateway
 * (github.com/EvolutionAPI/evolution-api, unofficial -- Baileys under
 * the hood, no browser) instead of the official Meta Cloud API. Each
 * business links its own number by scanning a QR code (see
 * ChannelController.createTestWhatsappSession/testWhatsappQr) rather
 * than pasting a permanent token -- no Meta Business Verification
 * needed, at the cost of real ban risk (see this integration's own
 * setup notes). Replaces the earlier OpenWA integration; kept the same
 * channel id ("whatsapp-test") so existing ChannelConnection rows and
 * webhook routing didn't need a data migration. */
export const evolutionWhatsappAdapter: ChannelAdapter = {
  id: "whatsapp-test",
  label: "WhatsApp (testing, Evolution API)",
  requiresPlatformApp: false,

  parseInboundMessage(payload: unknown): InboundMessage[] {
    const body = payload as EvolutionWebhookPayload;
    if (body.event !== "messages.upsert") return [];

    const instanceName = body.instance;
    const from = body.data?.key?.remoteJid;
    if (!instanceName || !from || body.data?.key?.fromMe) return [];

    if (body.data?.messageType === "imageMessage") {
      const messageId = body.data.key?.id;
      if (!messageId) return [];
      return [
        {
          externalId: instanceName,
          senderId: from,
          text: body.data.message?.imageMessage?.caption ?? "",
          imageMediaId: messageId,
        },
      ];
    }

    const text = body.data?.message?.conversation ?? body.data?.message?.extendedTextMessage?.text;
    if (!text) return [];

    return [{ externalId: instanceName, senderId: from, text }];
  },

  async resolveImageUrl(connection: ChannelConnectionInfo, mediaId: string): Promise<string | null> {
    return getBase64FromMediaMessage(connection.externalId, mediaId);
  },

  async sendMessage(connection: ChannelConnectionInfo, recipientId: string, text: string): Promise<void> {
    await sendHumanPacedMessage(connection.externalId, recipientId, text);
  },
};
