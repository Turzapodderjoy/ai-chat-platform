import { GroqProvider } from "@ai-chat-platform/groq";
import { GeminiProvider } from "@ai-chat-platform/gemini";
import { OpenRouterProvider } from "@ai-chat-platform/openrouter";
import { CerebrasProvider } from "@ai-chat-platform/cerebras";
import { MistralProvider } from "@ai-chat-platform/mistral";

import type { ProviderCatalogEntry } from "./types";

/**
 * Every AI provider that has a real, working adapter class. Adding a new
 * provider here is the ONLY code change needed to make it available for
 * activation (env var at startup, or the dashboard's "Add provider" form
 * at runtime) — nothing in bootstrap, the API, or the dashboard hardcodes
 * provider names. Order here also doubles as the default failover order
 * (AIManager.orderedProviders falls back to registration order when no
 * explicit failoverOrder is configured, and registerProviders() loops
 * over this array in order).
 */
export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "groq",
    label: "Groq",
    envKey: "GROQ_API_KEY",
    create: () => new GroqProvider(),
  },
  {
    id: "gemini",
    label: "Gemini",
    envKey: "GEMINI_API_KEY",
    create: () => new GeminiProvider(),
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    create: () => new OpenRouterProvider(),
  },
  {
    id: "cerebras",
    label: "Cerebras",
    envKey: "CEREBRAS_API_KEY",
    create: () => new CerebrasProvider(),
  },
  {
    id: "mistral",
    label: "Mistral",
    envKey: "MISTRAL_API_KEY",
    create: () => new MistralProvider(),
  },
];

/**
 * Providers named in the product plan that don't have an adapter yet.
 * Listed so the dashboard can show them as "not implemented" instead of
 * pretending they work — implementing one means writing a class that
 * implements AIProvider and adding one entry above.
 */
export const PLANNED_PROVIDERS: { id: string; label: string }[] = [
  { id: "claude", label: "Claude" },
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Ollama" },
  { id: "together", label: "Together" },
];
