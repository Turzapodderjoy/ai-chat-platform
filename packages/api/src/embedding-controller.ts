import { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import {
  EMBEDDING_PROVIDER_CATALOG,
  PLANNED_EMBEDDING_PROVIDERS,
} from "@ai-chat-platform/embedding-catalog";
import { ProviderKeyStore, ProviderStateStore } from "@ai-chat-platform/provider-keys";
import { IndexingService } from "@ai-chat-platform/indexing";

/**
 * Same shape as AdminController's provider-management methods (providers/
 * catalog/activateProvider/setProviderEnabled/usage), just for embedding
 * providers instead of AI chat providers — the two systems are fully
 * separate (own EmbeddingManager/AIManager instance, own catalog, own
 * "kind" in ProviderApiKey) so they can never collide even when a
 * provider has the same name in both (e.g. "gemini").
 */
export class EmbeddingController {
  constructor(
    private readonly embeddings: EmbeddingManager,
    private readonly providerKeys: ProviderKeyStore,
    private readonly indexing: IndexingService,
    private readonly providerState: ProviderStateStore
  ) {}

  // Same cross-instance staleness fix as AdminController.providers() —
  // see its comment for why every read re-syncs from the DB truth first.
  async providers() {
    const disabled = await this.providerState.getDisabled("embedding");

    for (const status of this.embeddings.getProviderStatus()) {
      if (this.embeddings.isProviderEnabled(status.name) === disabled.includes(status.name)) {
        this.embeddings.setProviderEnabled(status.name, !disabled.includes(status.name));
      }
    }

    return {
      active: this.embeddings.getProviders().map((p) => p.name),
      status: this.embeddings.getProviderStatus(),
    };
  }

  /** Per-provider embed coverage for one business's knowledge base —
   * combines IndexingService's coverage counts with each provider's live
   * enabled/healthy/key status, so the Knowledge Hub can show not just
   * "how much is embedded" but "why" when it's incomplete (provider
   * disabled, unhealthy, or missing a key vs. genuinely not backfilled yet). */
  async coverageStatus(businessId: string) {
    const [coverage, status] = await Promise.all([
      this.indexing.coverageStatus(businessId),
      Promise.resolve(this.embeddings.getProviderStatus()),
    ]);

    const statusByName = new Map(status.map((s) => [s.name.toLowerCase(), s]));

    return coverage.map((c) => {
      const providerStatus = statusByName.get(c.provider.toLowerCase());
      return {
        ...c,
        enabled: providerStatus?.enabled ?? false,
        healthy: providerStatus?.healthy ?? false,
        hasUsableKey: providerStatus?.hasUsableKey ?? false,
      };
    });
  }

  /** Every embedding provider the dashboard can offer to activate, coded or not. */
  catalog() {
    return {
      available: EMBEDDING_PROVIDER_CATALOG.map((entry) => ({
        id: entry.id,
        label: entry.label,
      })),
      planned: PLANNED_EMBEDDING_PROVIDERS,
    };
  }

  /** Registers (or re-keys) an embedding provider at runtime — no restart
   * needed — AND persists the key to Postgres so it survives one, same
   * as AdminController.activateProvider() for AI chat providers. */
  async activateProvider(id: string, apiKey: string): Promise<{ activated: string }> {
    const entry = EMBEDDING_PROVIDER_CATALOG.find((e) => e.id === id);

    if (!entry) {
      throw new Error(
        `No adapter implemented for "${id}" yet — add it to packages/embedding-catalog first.`
      );
    }

    if (!apiKey.trim()) {
      throw new Error("API key is required.");
    }

    if (this.embeddings.hasProvider(id)) {
      this.embeddings.setProviderKey(id, apiKey);
    } else {
      this.embeddings.registerProvider(entry.create(), [
        { id: `${id}-ui`, value: apiKey },
      ]);
    }

    await this.providerKeys.set("embedding", id, apiKey);

    return { activated: id };
  }

  /** Forces an embedding provider on/off for experimentation — same
   * semantics as AdminController.setProviderEnabled(), including the
   * same persistence fix (previously reverted to enabled on restart). */
  async setProviderEnabled(id: string, enabled: boolean): Promise<{ id: string; enabled: boolean }> {
    this.embeddings.setProviderEnabled(id, enabled);
    await this.providerState.setEnabled("embedding", id, enabled);
    return { id, enabled };
  }

  /** Same semantics as AdminController.removeProviderKey(). */
  async removeProviderKey(id: string): Promise<{ id: string }> {
    if (this.embeddings.hasProvider(id)) {
      this.embeddings.clearProviderKeys(id);
    }

    await this.providerKeys.remove("embedding", id);

    return { id };
  }

  usage() {
    return this.embeddings.getUsage();
  }

  /** Backfills missing embedding-provider coverage across every
   * client's knowledge base (or one, if businessId is given) — run
   * daily via cron so every provider stays fully mapped even as new
   * providers get added or a temporarily-down one recovers. */
  async backfillAllProviders(businessId?: string) {
    return this.indexing.backfillAllProviders(businessId);
  }

  /** One provider, one business — the Knowledge Hub coverage table's
   * per-row "Backfill" button, for fixing just the provider that's
   * behind without re-checking every other one. */
  async backfillProvider(businessId: string, provider: string) {
    return this.indexing.backfillProvider(businessId, provider);
  }
}
