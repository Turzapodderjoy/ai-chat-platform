import { prisma } from "@ai-chat-platform/database";

/** Separates AI chat providers from embedding providers — both systems
 * can have a same-named provider (e.g. "gemini") active at once, with a
 * different API key each, and they must never collide. */
export type ProviderKind = "ai" | "embedding";

/**
 * Durable store for API keys entered through the dashboard's "activate
 * provider" form. Without this, activation only ever patched the running
 * manager in memory — real, but silently gone the next time the process
 * restarts (dev server reload, redeploy, crash), which isn't "plug and
 * play" no matter how the dashboard copy reads.
 */
export class ProviderKeyStore {
  /** providerId -> apiKey, for every provider of this kind that's ever
   * been activated through the dashboard. */
  async getAll(kind: ProviderKind): Promise<Record<string, string>> {
    const rows = await prisma.providerApiKey.findMany({ where: { kind } });
    return Object.fromEntries(rows.map((r) => [r.providerId, r.apiKey]));
  }

  async set(kind: ProviderKind, providerId: string, apiKey: string): Promise<void> {
    await prisma.providerApiKey.upsert({
      where: { kind_providerId: { kind, providerId } },
      create: { kind, providerId, apiKey },
      update: { apiKey },
    });
  }

  /** Deletes the persisted key. Doesn't remove the provider from the
   * running manager's registry (no unregister capability exists there),
   * but a caller should also clear its in-memory keys — see
   * AIManager.clearProviderKeys()/EmbeddingManager equivalent — so
   * hasUsableKey() correctly flips to false immediately, not just after
   * a restart. */
  async remove(kind: ProviderKind, providerId: string): Promise<void> {
    await prisma.providerApiKey.deleteMany({ where: { kind, providerId } });
  }
}
