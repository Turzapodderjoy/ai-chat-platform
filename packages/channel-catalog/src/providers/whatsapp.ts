import type { ChannelAdapter, ChannelConnectionInfo, InboundMessage } from "../types";
import { resolveWhatsAppMediaAsDataUri, sendGraphMessage, verifyMetaWebhookChallenge } from "./meta-shared";

interface WhatsappWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: Array<{ from?: string; text?: { body?: string }; type?: string; image?: { id?: string; caption?: string } }>;
      };
    }>;
  }>;
}

/** No OAuth — full Embedded Signup needs Meta Tech Provider access a
 * fresh Meta App doesn't have. Connecting instead means an admin pastes
 * the Phone Number ID + permanent access token generated in Meta
 * Business Suite directly into the dashboard form (see
 * ChannelController.connectWhatsapp). Upgradeable to Embedded Signup
 * later without a data model change — it would just populate the same
 * ChannelConnection row via exchangeCodeForConnection instead. */
export const whatsappAdapter: ChannelAdapter = {
  id: "whatsapp",
  label: "WhatsApp",
  requiresPlatformApp: false,

  verifyWebhookChallenge: verifyMetaWebhookChallenge,

  parseInboundMessage(payload: unknown): InboundMessage[] {
    const body = payload as WhatsappWebhookPayload;
    const messages: InboundMessage[] = [];

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const phoneNumberId = change.value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        for (const msg of change.value?.messages ?? []) {
          const senderId = msg.from;
          if (!senderId) continue;

          if (msg.type === "image" && msg.image?.id) {
            messages.push({ externalId: phoneNumberId, senderId, text: msg.image.caption ?? "", imageMediaId: msg.image.id });
            continue;
          }

          const text = msg.text?.body;
          if (text) {
            messages.push({ externalId: phoneNumberId, senderId, text });
          }
        }
      }
    }

    return messages;
  },

  async resolveImageUrl(connection: ChannelConnectionInfo, mediaId: string): Promise<string | null> {
    return resolveWhatsAppMediaAsDataUri(mediaId, connection.accessToken);
  },

  async sendMessage(connection: ChannelConnectionInfo, recipientId: string, text: string): Promise<void> {
    await sendGraphMessage({
      recipientPath: `${connection.externalId}/messages`,
      accessToken: connection.accessToken,
      body: { messaging_product: "whatsapp", to: recipientId, text: { body: text } },
    });
  },
};
