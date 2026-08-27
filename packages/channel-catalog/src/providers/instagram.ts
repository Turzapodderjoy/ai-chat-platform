import type { ChannelAdapter, ChannelConnectionInfo, InboundMessage, OAuthExchangeResult, PlatformAppCredential } from "../types";
import {
  buildFacebookOAuthUrl,
  exchangeCodeForUserToken,
  listPages,
  sendGraphMessage,
  verifyMetaWebhookChallenge,
} from "./meta-shared";

interface InstagramWebhookPayload {
  entry?: Array<{
    id?: string;
    messaging?: Array<{
      sender?: { id?: string };
      message?: { text?: string; attachments?: Array<{ type?: string; payload?: { url?: string } }> };
    }>;
  }>;
}

/** Instagram DMs require an Instagram Business/Creator account linked to
 * a Facebook Page — connecting is still "log in with Facebook", but the
 * externalId this stores is the linked instagram_business_account id
 * (not the Page id), since that's what shows up in the IG webhook
 * payload's entry.id. */
export const instagramAdapter: ChannelAdapter = {
  id: "instagram",
  label: "Instagram",
  requiresPlatformApp: true,

  buildConnectUrl(businessId, redirectUri, appId) {
    return buildFacebookOAuthUrl({
      appId,
      redirectUri,
      businessId,
      scope: "instagram_basic,instagram_manage_messages,pages_show_list",
    });
  },

  async exchangeCodeForConnection(
    code: string,
    app: PlatformAppCredential,
    redirectUri: string
  ): Promise<OAuthExchangeResult> {
    const userToken = await exchangeCodeForUserToken(code, app, redirectUri);
    const pages = await listPages(userToken);
    const page = pages.find((p) => p.instagram_business_account);

    if (!page?.instagram_business_account) {
      throw new Error(
        "No Instagram Business account found — link an Instagram account to a Facebook Page (in Meta Business Suite) before connecting."
      );
    }

    return {
      externalId: page.instagram_business_account.id,
      externalLabel: `${page.name} (Instagram)`,
      // IG messaging sends through the Page's access token, same as Messenger.
      accessToken: page.access_token,
    };
  },

  verifyWebhookChallenge: verifyMetaWebhookChallenge,

  parseInboundMessage(payload: unknown): InboundMessage[] {
    const body = payload as InstagramWebhookPayload;
    const messages: InboundMessage[] = [];

    for (const entry of body.entry ?? []) {
      const igAccountId = entry.id;
      if (!igAccountId) continue;

      for (const event of entry.messaging ?? []) {
        const senderId = event.sender?.id;
        if (!senderId) continue;

        const text = event.message?.text;
        const imageUrl = event.message?.attachments?.find((a) => a.type === "image")?.payload?.url;

        if (imageUrl) {
          messages.push({ externalId: igAccountId, senderId, text: text ?? "", imageUrl });
        } else if (text) {
          messages.push({ externalId: igAccountId, senderId, text });
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
