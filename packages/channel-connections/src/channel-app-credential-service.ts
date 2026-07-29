import { prisma } from "@ai-chat-platform/database";

export interface ChannelAppCredentialRecord {
  channel: string;
  appId: string;
  appSecret: string;
  webhookVerifyToken: string;
}

/** Prisma-backed persistence for the platform-wide (not per-client) Meta
 * App credentials — one row per channel, entered once via the mother
 * dashboard, required before any client can OAuth-connect that channel. */
export class ChannelAppCredentialService {
  async get(channel: string): Promise<ChannelAppCredentialRecord | null> {
    const row = await prisma.channelAppCredential.findUnique({ where: { channel } });
    return row;
  }

  async all(): Promise<ChannelAppCredentialRecord[]> {
    return prisma.channelAppCredential.findMany();
  }

  async set(
    channel: string,
    appId: string,
    appSecret: string,
    webhookVerifyToken: string
  ): Promise<ChannelAppCredentialRecord> {
    return prisma.channelAppCredential.upsert({
      where: { channel },
      create: { channel, appId, appSecret, webhookVerifyToken },
      update: { appId, appSecret, webhookVerifyToken },
    });
  }
}
