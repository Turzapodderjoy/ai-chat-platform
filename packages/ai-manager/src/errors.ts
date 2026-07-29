// Re-exported (not redefined) so instanceof checks here and in provider
// packages (groq, gemini, openrouter, ...) refer to the exact same class,
// letting any provider throw these without depending on ai-manager itself.
export {
  AIManagerError,
  InvalidApiKeyError,
  RateLimitedError,
  ProviderUnavailableError,
  AllProvidersFailedError,
} from "@ai-chat-platform/types";
