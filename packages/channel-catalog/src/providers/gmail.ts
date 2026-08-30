import type { ChannelAdapter, OAuthExchangeResult, PlatformAppCredential } from "../types";

/** Outbound-only -- no inbound webhook, no sendMessage (chat replies never
 * go through Gmail). Used exclusively by GmailEmailClient (packages/email)
 * for status-change notification emails, not the chat pipeline at all. */
export const gmailAdapter: ChannelAdapter = {
  id: "gmail",
  label: "Gmail",
  requiresPlatformApp: true,

  buildConnectUrl(businessId, redirectUri, appId) {
    const query = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.send",
      // offline + consent are both required to actually get a
      // refresh_token back -- Google only issues one on the FIRST
      // consent per account otherwise, and this app needs to keep
      // sending long after the short-lived access token expires.
      access_type: "offline",
      prompt: "consent",
      state: businessId,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
  },

  async exchangeCodeForConnection(
    code: string,
    app: PlatformAppCredential,
    redirectUri: string
  ): Promise<OAuthExchangeResult> {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: app.appId,
        client_secret: app.appSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Google OAuth token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    }

    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!token.refresh_token) {
      throw new Error(
        "Google didn't return a refresh token -- this Google account already granted this app access before. Revoke it at https://myaccount.google.com/permissions and connect again."
      );
    }

    const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    if (!profileRes.ok) {
      throw new Error(`Gmail profile lookup failed: ${profileRes.status} ${await profileRes.text()}`);
    }

    const profile = (await profileRes.json()) as { emailAddress: string };

    return {
      externalId: profile.emailAddress,
      externalLabel: profile.emailAddress,
      accessToken: token.access_token,
      config: {
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + token.expires_in * 1000,
      },
    };
  },
};
