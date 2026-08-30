export interface AIRequest {
  userId: string;
  message: string;
  sessionId: string;
  /** 0.0-1.0. Providers that support it should pass this straight through
   * to their completion call; providers that don't can ignore it. */
  temperature?: number;
  /** Sent via each provider's actual system role (or systemInstruction,
   * for providers that don't use OpenAI-style messages) instead of being
   * flattened into the user message. Models are trained to weight
   * system-level instructions differently from user text, so keeping
   * this separate matters for consistent instruction-following (format
   * rules, language lock, the handoff marker) across different provider
   * APIs — previously every provider got the entire system prompt +
   * knowledge base + history crammed into one user-role blob. */
  systemPrompt?: string;
  /** Equal output-length budget every provider should apply identically.
   * Without this, each provider silently falls back to its own API's
   * default cap — those defaults differ across vendors, so answers could
   * get cut off inconsistently for reasons unrelated to the question
   * actually asked. */
  maxTokens?: number;
  /** Nucleus sampling — passed through as-is (top_p / topP depending on
   * provider); undefined lets the provider use its own default. */
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  seed?: number;
  /** Optional image URL for multimodal providers. When present, vision-
   * capable providers (OpenRouter/MiMo, Gemini) should send the image
   * as a content part alongside the text message. Providers that don't
   * support vision can ignore this. */
  imageUrl?: string;
}

export interface AIResponse {
  success: boolean;
  provider: string;
  message: string;
  tokens?: number;
  error?: string;
}

export interface ProviderKey {
  id: string;
  value: string;
}

export interface AIProvider {
  readonly name: string;

  generate(
    request: AIRequest,
    apiKey?: string
  ): Promise<AIResponse>;

  health?(): Promise<boolean>;
}