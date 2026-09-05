import { randomBytes } from "node:crypto";
import { prisma } from "@ai-chat-platform/database";

export interface GoogleSignInConfig {
  id: string;
  businessId: string;
  clientId: string;
  enabled: boolean;
  updatedAt: Date;
}

export interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

function toConfig(row: any): GoogleSignInConfig {
  return {
    id: row.id,
    businessId: row.businessId,
    clientId: row.clientId,
    enabled: row.enabled,
    updatedAt: row.updatedAt,
  };
}

export class GoogleSignInService {
  async getConfig(businessId: string): Promise<GoogleSignInConfig | null> {
    const row = await prisma.googleSignInConfig.findUnique({
      where: { businessId },
    });
    return row ? toConfig(row) : null;
  }

  async upsert(data: {
    businessId: string;
    clientId: string | null;
    enabled: boolean;
  }): Promise<GoogleSignInConfig> {
    if (!data.clientId) {
      throw new Error("clientId is required");
    }
    const row = await prisma.googleSignInConfig.upsert({
      where: { businessId: data.businessId },
      create: {
        businessId: data.businessId,
        clientId: data.clientId,
        enabled: data.enabled,
      },
      update: {
        clientId: data.clientId,
        enabled: data.enabled,
      },
    });
    return toConfig(row);
  }

  async delete(businessId: string): Promise<void> {
    await prisma.googleSignInConfig.deleteMany({
      where: { businessId },
    });
  }

  /** Exchange an authorization code for tokens and user info from Google. */
  async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<GoogleUserInfo> {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Google token exchange failed: ${err}`);
    }

    const tokens: GoogleTokenResponse = await tokenRes.json();

    // Fetch user info from Google
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      throw new Error("Failed to fetch user info from Google");
    }

    const googleUser = await userRes.json();
    return {
      sub: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
    };
  }

  /** Find or create a ClientAccount for a Google user, then issue a session. */
  async findOrCreateAccount(
    businessId: string,
    googleUser: GoogleUserInfo
  ): Promise<{ token: string; expiresAt: Date; businessId: string }> {
    // Try to find an existing account linked to this Google ID + business
    let account = await prisma.clientAccount.findFirst({
      where: {
        businessId,
        googleId: googleUser.sub,
      },
    });

    if (!account) {
      // Also try matching by email (Google user might have signed up with password first)
      const existingByEmail = await prisma.clientAccount.findFirst({
        where: {
          businessId,
          OR: [
            { username: googleUser.email },
            { googleEmail: googleUser.email },
          ],
        },
      });

      if (existingByEmail) {
        // Link this Google account to the existing account
        account = await prisma.clientAccount.update({
          where: { id: existingByEmail.id },
          data: {
            googleId: googleUser.sub,
            googleEmail: googleUser.email,
          },
        });
      } else {
        // Create a new account — username is the email, random password (OAuth-only)
        const randomPassword = randomBytes(16).toString("hex");
        const username = googleUser.email;

        // Ensure username is unique (append random suffix if taken)
        let finalUsername = username;
        const existingUser = await prisma.clientAccount.findUnique({
          where: { username: finalUsername },
        });
        if (existingUser) {
          finalUsername = `${googleUser.email.split("@")[0]}_${randomBytes(4).toString("hex")}@${googleUser.email.split("@")[1]}`;
        }

        account = await prisma.clientAccount.create({
          data: {
            businessId,
            username: finalUsername,
            // Scrypt-hash the random password — nobody will use it (OAuth-only)
            passwordHash: `google-oauth:${randomBytes(16).toString("hex")}:${randomBytes(16).toString("hex")}`,
            googleId: googleUser.sub,
            googleEmail: googleUser.email,
            role: "owner",
          },
        });
      }
    }

    // Issue a session
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.$transaction([
      prisma.clientSession.create({
        data: {
          token,
          clientAccountId: account.id,
          expiresAt,
        },
      }),
      prisma.clientAccount.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    return { token, expiresAt, businessId };
  }
}
