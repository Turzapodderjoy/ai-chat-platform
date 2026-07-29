import { GoogleGenAI, ApiError } from "@google/genai";
import { DEFAULT_MODEL } from "./models";
import type { AIProvider, AIRequest, AIResponse } from "@ai-chat-platform/types";
import { InvalidApiKeyError, RateLimitedError } from "@ai-chat-platform/types";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  async generate(request: AIRequest, apiKey?: string): Promise<AIResponse> {
    if (!apiKey) {
      return {
        success: false,
        provider: this.name,
        message: "",
        error: "No API key provided",
      };
    }

    try {
      const client = new GoogleGenAI({ apiKey });

      const hasConfig =
        request.temperature !== undefined ||
        request.systemPrompt !== undefined ||
        request.maxTokens !== undefined ||
        request.topP !== undefined ||
        request.frequencyPenalty !== undefined ||
        request.presencePenalty !== undefined ||
        request.stop !== undefined ||
        request.seed !== undefined;

      const response = await client.models.generateContent({
        model: DEFAULT_MODEL,
        contents: request.message,
        config: hasConfig
          ? {
              temperature: request.temperature,
              systemInstruction: request.systemPrompt,
              maxOutputTokens: request.maxTokens,
              topP: request.topP,
              frequencyPenalty: request.frequencyPenalty,
              presencePenalty: request.presencePenalty,
              stopSequences: request.stop,
              seed: request.seed,
            }
          : undefined,
      });

      return {
        success: true,
        provider: this.name,
        message: response.text ?? "",
        tokens: response.usageMetadata?.totalTokenCount ?? 0,
      };
    } catch (error) {
      // Same reasoning as GroqProvider: must throw the typed errors so
      // AIManager's key-health/failover logic (which only runs in its
      // catch block) actually fires instead of being silently bypassed.
      const status = error instanceof ApiError ? error.status : undefined;
      const message = error instanceof Error ? error.message : String(error);

      if (status === 401 || status === 403) {
        throw new InvalidApiKeyError(message);
      }

      if (status === 429) {
        throw new RateLimitedError(message);
      }

      throw error instanceof Error ? error : new Error(message);
    }
  }

  async health(): Promise<boolean> {
    return true;
  }
}
