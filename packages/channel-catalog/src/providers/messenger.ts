import type { ChannelAdapter, ChannelConnectionInfo, InboundMessage, OAuthExchangeResult, PlatformAppCredential } from "../types";
import {
  buildFacebookOAuthUrl,
  exchangeCodeForUserToken,
  listPages,
  sendGraphMessage,
  verifyMetaWebhookChallenge,
} from "./meta-shared";

interface MessengerWebhookPayload {
  entry?: Array<{
    id?: string;
    messaging?: Array<{
      sender?: { id?: string };
      message?: { text?: string };
    }>;
  }>;
}

export const messengerAdapter: ChannelAdapter = {
  id: "messenger",
  label: "Facebook Messenger",
  requiresPlatformApp: true,

  buildConnectUrl(businessId, redirectUri, appId) {
    return buildFacebookOAuthUrl({
      appId,
      redirectUri,
      businessId,
      scope: "pages_messaging,pages_show_list,pages_manage_metadata",
    });
  },

  async exchangeCodeForConnection(
    code: string,
    app: PlatformAppCredential,
    redirectUri: string
  ): Promise<OAuthExchangeResult> {
    const userToken = await exchangeCodeForUserToken(code, app, redirectUri);
    const pages = await listPages(userToken);
    const page = pages[0];

    if (!page) {
      throw new Error(
        "No Facebook Page found for this account — Messenger requires the authorizing user to be an admin of at least one Page."
      );
    }

    return {
      externalId: page.id,
      externalLabel: page.name,
      accessToken: page.access_token,
    };
  },

  verifyWebhookChallenge: verifyMetaWebhookChallenge,

  parseInboundMessage(payload: unknown): InboundMessage[] {
    const body = payload as MessengerWebhookPayload;
    const messages: InboundMessage[] = [];

    for (const entry of body.entry ?? []) {
      const pageId = entry.id;
      if (!pageId) continue;

      for (const event of entry.messaging ?? []) {
        const senderId = event.sender?.id;
        const text = event.message?.text;
        if (senderId && text) {
          messages.push({ externalId: pageId, senderId, text });
        }
      }
    }

    return messages;
  },

  async sendMessage(connection: ChannelConnectionInfo, recipientId: string, text: string): Promise<void> {
    await sendGraphMessage({
      recipientPath: "me/messages",
      accessToken: connection.accessToken,
      body: { recipient: { id: recipientId }, message: { text } },
    });
  },
};
