import { AIManager } from "@ai-chat-platform/ai-manager";
import { PROVIDER_CATALOG } from "@ai-chat-platform/provider-catalog";

/**
 * Auto-activates every catalog entry that has a key, from either source.
 * A dashboard-activated key (persistedKeys, from Postgres) wins over the
 * env var for the same provider — it represents the most recent explicit
 * action an operator took, and "plug and play" means that action has to
 * stick past a restart, not silently revert to whatever .env says.
 * Adding a new provider adapter never requires touching this function —
 * add it to PROVIDER_CATALOG (packages/provider-catalog) and set its env
 * var, or activate it from the dashboard.
 */
export function registerProviders(
  manager: AIManager,
  persistedKeys: Record<string, string> = {},
  persistedDisabled: string[] = []
): void {
  for (const entry of PROVIDER_CATALOG) {
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

  // Applied last, after every provider that's going to exist this run is
  // registered — setProviderEnabled() throws for an unregistered name,
  // and the on/off toggle only makes sense once there's something to
  // toggle. Without this, a dashboard "turn off" only ever patched the
  // in-memory Set and silently reverted to enabled on the next restart.
  for (const id of persistedDisabled) {
    if (manager.hasProvider(id)) {
      manager.setProviderEnabled(id, false);
    }
  }
}
