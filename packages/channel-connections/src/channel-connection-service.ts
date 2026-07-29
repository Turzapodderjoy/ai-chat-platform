import { prisma } from "@ai-chat-platform/database";
import type { Prisma } from "@prisma/client";

export interface ChannelConnectionRecord {
  businessId: string;
  channel: string;
  status: string;
  externalId: string;
  externalLabel: string;
  accessToken: string;
  config: Record<string, unknown> | null;
  updatedAt: string;
}

/** Prisma-backed persistence for per-client channel connections — same
 * shape as ProviderKeyStore, one durable row per (business, channel). */
export class ChannelConnectionService {
  async forBusiness(businessId: string): Promise<ChannelConnectionRecord[]> {
    const rows = await prisma.channelConnection.findMany({ where: { businessId } });
    return rows.map(toRecord);
  }

  async upsert(params: {
    businessId: string;
    channel: string;
    externalId: string;
    externalLabel: string;
    accessToken: string;
    config?: Record<string, unknown> | null;
  }): Promise<ChannelConnectionRecord> {
    const row = await prisma.channelConnection.upsert({
      where: { businessId_channel: { businessId: params.businessId, channel: params.channel } },
      create: {
        businessId: params.businessId,
        channel: params.channel,
        externalId: params.externalId,
        externalLabel: params.externalLabel,
        accessToken: params.accessToken,
        config: (params.config ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {
        status: "connected",
        externalId: params.externalId,
        externalLabel: params.externalLabel,
        accessToken: params.accessToken,
        config: (params.config ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    return toRecord(row);
  }

  /** Deletes the connection outright rather than soft-deleting — a
   * disconnected channel has no reason to keep a stale access token
   * around, and the dashboard already treats "no row" as "not
   * connected". */
  async disconnect(businessId: string, channel: string): Promise<void> {
    await prisma.channelConnection.deleteMany({ where: { businessId, channel } });
  }

  /** Resolves an inbound webhook message's Page/IG account/phone number
   * id back to the business it belongs to. */
  async findByExternalId(channel: string, externalId: string): Promise<ChannelConnectionRecord | null> {
    const row = await prisma.channelConnection.findFirst({
      where: { channel, externalId, status: "connected" },
    });

    return row ? toRecord(row) : null;
  }
}

type ConnectionRow = {
  businessId: string;
  channel: string;
  status: string;
  externalId: string;
  externalLabel: string;
  accessToken: string;
  config: unknown;
  updatedAt: Date;
};

function toRecord(row: ConnectionRow): ChannelConnectionRecord {
  return {
    businessId: row.businessId,
    channel: row.channel,
    status: row.status,
    externalId: row.externalId,
    externalLabel: row.externalLabel,
    accessToken: row.accessToken,
    config: (row.config as Record<string, unknown> | null) ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
