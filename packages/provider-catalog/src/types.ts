import type { AIProvider } from "@ai-chat-platform/types";

export interface ProviderCatalogEntry {
  id: string;
  label: string;
  /** Env var checked at startup to auto-activate this provider. */
  envKey: string;
  create: () => AIProvider;
}
