import { prisma } from "@ai-chat-platform/database";

import type { ProviderKind } from "./provider-key-store";

/**
 * Durable store for the dashboard's provider on/off toggle — without
 * this, disabling a provider only ever patched the running AIManager/
 * EmbeddingManager's in-memory Set, silently reverting to "enabled" the
 * next time the process restarts (dev reload, redeploy, serverless cold
 * start). Only disabled providers get a row — enabled is the default.
 */
export class ProviderStateStore {
  /** Every providerId of this kind that's been explicitly disabled. */
  async getDisabled(kind: ProviderKind): Promise<string[]> {
    const rows = await prisma.providerState.findMany({
      where: { kind, enabled: false },
    });
    return rows.map((r) => r.providerId);
  }

  async setEnabled(kind: ProviderKind, providerId: string, enabled: boolean): Promise<void> {
    await prisma.providerState.upsert({
      where: { kind_providerId: { kind, providerId } },
      create: { kind, providerId, enabled },
      update: { enabled },
    });
  }
}
