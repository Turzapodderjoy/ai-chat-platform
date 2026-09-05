import { prisma } from "@ai-chat-platform/database";

export interface GoogleSignInConfig {
  id: string;
  businessId: string;
  clientId: string;
  enabled: boolean;
  updatedAt: Date;
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
}
