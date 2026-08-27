import type { ChannelAdapter, ChannelConnectionInfo, InboundMessage } from "../types";
import { sendTextMessage } from "./evolution-shared";

/** Baileys-native message shape, passed through by Evolution API's
 * MESSAGES_UPSERT webhook mostly as-is (confirmed via Evolution API's
 * own OpenAPI schema: `key`/`message`/`messageType`/`fromMe` fields) --
 * text lives in one of a few possible sub-fields depending on how the
 * customer's client sent it, so every known location is checked rather
 * than assuming one. */
interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
    };
    messageType?: string;
  };
}

// ponytail: image messages on this channel are NOT wired up yet — a
// Baileys imageMessage's own `url` is an encrypted WhatsApp CDN link
// (needs the accompanying mediaKey run through Baileys' own decryption,
// not a plain HTTP fetch), and it's unconfirmed whether this gateway's
// webhook config can be set to re-host/decrypt media before it reaches
// here. Rather than guess and ship a silent failure, this channel stays
// text-only for now; the official whatsapp/messenger/instagram adapters
// and the website widget all support photos today. Upgrade path: check
// this gateway's actual webhook payload for an image message live
// (`webhook_base64` setting may already hand back decrypted bytes), and
// wire it the same way whatsapp.ts's resolveImageUrl does.

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
    const text = body.data?.message?.conversation ?? body.data?.message?.extendedTextMessage?.text;

    if (!instanceName || !from || !text || body.data?.key?.fromMe) return [];

    return [{ externalId: instanceName, senderId: from, text }];
  },

  async sendMessage(connection: ChannelConnectionInfo, recipientId: string, text: string): Promise<void> {
    await sendTextMessage(connection.externalId, recipientId, text);
  },
};
