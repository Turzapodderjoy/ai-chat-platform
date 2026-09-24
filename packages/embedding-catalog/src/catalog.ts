import { JinaProvider } from "@ai-chat-platform/embedding-manager";
import { MistralEmbeddingProvider } from "@ai-chat-platform/mistral";

import type { EmbeddingCatalogEntry } from "./types";

/**
 * Every embedding provider with a real, working adapter class — same
 * pattern as packages/provider-catalog for AI chat providers. Adding one
 * here is the only code change needed to make it available for
 * activation (env var at startup, or the dashboard's Embedding Providers
 * panel at runtime).
 */
export const EMBEDDING_PROVIDER_CATALOG: EmbeddingCatalogEntry[] = [
  {
    id: "jina",
    label: "Jina",
    envKey: "JINA_API_KEY",
    create: () => new JinaProvider(),
  },
  {
    id: "mistral",
    label: "Mistral",
    envKey: "MISTRAL_EMBEDDING_API_KEY",
    create: () => new MistralEmbeddingProvider(),
  },
];

/** Embedding providers named in the product plan without an adapter yet. */
export const PLANNED_EMBEDDING_PROVIDERS: { id: string; label: string }[] = [
  { id: "cohere", label: "Cohere" },
  { id: "voyage", label: "Voyage AI" },
];
