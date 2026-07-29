import { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import { VectorStoreManager, PostgresProvider } from "@ai-chat-platform/vector-store";
import { VectorStoreRetriever } from "@ai-chat-platform/retriever";
import { AIManager } from "@ai-chat-platform/ai-manager";
import { CustomOpenAICompatibleProvider } from "@ai-chat-platform/provider-catalog";
import { ProviderKeyStore, ProviderStateStore } from "@ai-chat-platform/provider-keys";
import { prisma } from "@ai-chat-platform/database";

import { Container } from "./container";
import { Application } from "./app";
import { registerProviders } from "./register-providers";
import { registerEmbeddingProviders } from "./register-embedding-providers";

/**
 * The one real composition root for production wiring. Kept separate from
 * `Container` (which stays synchronous and accepts any `Retriever`) because
 * the default retriever needs an async `initialize()` before first use —
 * same reason provider registration lives here rather than in Container's
 * constructor: it needs an async DB read (dashboard-persisted keys) before
 * `Container` can be built with already-populated `AIManager`/`EmbeddingManager`.
 */
export async function createApp(): Promise<Application> {
  const providerKeys = new ProviderKeyStore();
  const providerState = new ProviderStateStore();

  const ai = new AIManager();
  const disabledAi = await providerState.getDisabled("ai");
  registerProviders(ai, await providerKeys.getAll("ai"), disabledAi);

  // User-added providers (dashboard's "Add custom provider" form) — any
  // OpenAI-compatible /chat/completions API, not in the hardcoded
  // PROVIDER_CATALOG. Registered after the catalog so an id collision
  // (unlikely — custom ones get generated cuids) can never shadow a
  // real catalog entry.
  const customProviders = await prisma.customProvider.findMany();
  for (const cp of customProviders) {
    ai.registerProvider(
      new CustomOpenAICompatibleProvider(cp.id, cp.baseUrl, cp.model),
      [{ id: `${cp.id}-persisted`, value: cp.apiKey }]
    );

    if (disabledAi.includes(cp.id)) {
      ai.setProviderEnabled(cp.id, false);
    }
  }

  const embeddings = new EmbeddingManager();
  registerEmbeddingProviders(
    embeddings,
    await providerKeys.getAll("embedding"),
    await providerState.getDisabled("embedding")
  );

  const vectorStore = new VectorStoreManager(new PostgresProvider());
  await vectorStore.initialize();

  const retriever = new VectorStoreRetriever(embeddings, vectorStore);

  return new Application(
    new Container(retriever, vectorStore, embeddings, ai, providerKeys, providerState)
  );
}
