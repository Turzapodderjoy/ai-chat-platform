import type { EmbeddingProvider } from "@ai-chat-platform/embedding-manager";

export interface EmbeddingCatalogEntry {
  id: string;
  label: string;
  /** Env var checked at startup to auto-activate this provider. Deliberately
   * separate from any same-named AI chat provider's env var (e.g. Gemini's
   * chat key is GEMINI_API_KEY, its embedding key is GEMINI_EMBEDDING_API_KEY)
   * — same company, same account even, but a different API surface with its
   * own key, and the two must never be silently swapped for each other. */
  envKey: string;
  create: () => EmbeddingProvider;
}
