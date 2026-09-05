import { prisma } from "@ai-chat-platform/database";

export interface GmailSenderConfig {
  businessId: string;
  gmailAddress: string | null;
  appPassword: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}

export interface GmailSenderConfigInput {
  gmailAddress: string;
  appPassword?: string;
  accessToken?: string;
  refreshToken?: string;
}

/** Per-business Gmail sender identity. Supports two auth modes:
 *  1. OAuth (Google sign-in): accessToken + refreshToken stored, no appPassword
 *  2. App Password (manual): appPassword stored, no OAuth tokens
 * Single mutable row per business, null fields mean not configured. */
export class GmailSenderConfigService {
  async get(businessId: string): Promise<GmailSenderConfig> {
    const row = await prisma.gmailSenderConfig.findUnique({ where: { businessId } });
    if (!row) return { businessId, gmailAddress: null, appPassword: null, accessToken: null, refreshToken: null };
    return {
      businessId: row.businessId,
      gmailAddress: row.gmailAddress,
      appPassword: row.appPassword ?? null,
      accessToken: row.accessToken ?? null,
      refreshToken: row.refreshToken ?? null,
    };
  }

  async save(businessId: string, input: GmailSenderConfigInput): Promise<GmailSenderConfig> {
    const row = await prisma.gmailSenderConfig.upsert({
      where: { businessId },
      create: { businessId, ...input },
      update: { ...input },
    });
    return {
      businessId: row.businessId,
      gmailAddress: row.gmailAddress,
      appPassword: row.appPassword ?? null,
      accessToken: row.accessToken ?? null,
      refreshToken: row.refreshToken ?? null,
    };
  }

  async disconnect(businessId: string): Promise<void> {
    await prisma.gmailSenderConfig.deleteMany({ where: { businessId } });
  }

  /** Refresh the OAuth access token using the stored refresh token. */
  async refreshAccessToken(businessId: string): Promise<string | null> {
    const config = await this.get(businessId);
    if (!config.refreshToken) return null;

    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientSecret) return null;

    // Need the client ID — fetch from GoogleSignInConfig
    const googleConfig = await prisma.googleSignInConfig.findUnique({ where: { businessId } });
    if (!googleConfig?.clientId) return null;

    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: googleConfig.clientId,
          client_secret: clientSecret,
          refresh_token: config.refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!res.ok) return null;

      const tokens = await res.json();
      // Store the new access token
      await prisma.gmailSenderConfig.update({
        where: { businessId },
        data: { accessToken: tokens.access_token },
      });
      return tokens.access_token;
    } catch {
      return null;
    }
  }
}
