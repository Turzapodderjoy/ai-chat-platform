import { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import { EMBEDDING_PROVIDER_CATALOG } from "@ai-chat-platform/embedding-catalog";

/**
 * Same shape as register-providers.ts (AI chat providers) — a
 * dashboard-activated key (persistedKeys, from Postgres) wins over the
 * env var for the same provider. Adding a new embedding provider adapter
 * never requires touching this function — add it to
 * EMBEDDING_PROVIDER_CATALOG (packages/embedding-catalog) and set its
 * env var, or activate it from the dashboard's Embedding Providers panel.
 */
export function registerEmbeddingProviders(
  manager: EmbeddingManager,
  persistedKeys: Record<string, string> = {},
  persistedDisabled: string[] = []
): void {
  for (const entry of EMBEDDING_PROVIDER_CATALOG) {
    const persisted = persistedKeys[entry.id];
    const apiKey = persisted ?? process.env[entry.envKey];

    if (!apiKey) {
      continue;
    }

    manager.registerProvider(entry.create(), [
      {
        id: persisted ? `${entry.id}-persisted` : `${entry.id}-env`,
        value: apiKey,
      },
    ]);
  }

  // See register-providers.ts's identical comment — persisted disable
  // state must be applied after every provider that will exist this run
  // is registered.
  for (const id of persistedDisabled) {
    if (manager.hasProvider(id)) {
      manager.setProviderEnabled(id, false);
    }
  }
}
