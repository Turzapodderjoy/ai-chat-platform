import Groq from "groq-sdk";
import { DEFAULT_MODEL } from "./models";
import type { AIProvider, AIRequest, AIResponse } from "@ai-chat-platform/types";
import { InvalidApiKeyError, RateLimitedError } from "@ai-chat-platform/types";

export class GroqProvider implements AIProvider {
  readonly name = "groq";

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
      const client = new Groq({ apiKey });

      const response = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
          ...(request.systemPrompt
            ? [{ role: "system" as const, content: request.systemPrompt }]
            : []),
          { role: "user" as const, content: request.message },
        ],
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        top_p: request.topP,
        frequency_penalty: request.frequencyPenalty,
        presence_penalty: request.presencePenalty,
        stop: request.stop,
        seed: request.seed,
      });

      return {
        success: true,
        provider: this.name,
        message: response.choices[0]?.message?.content ?? "",
        tokens: response.usage?.total_tokens ?? 0,
      };
    } catch (error) {
      // Must throw the typed errors (not just return success:false) —
      // AIManager's key-health and provider-health tracking only run in
      // its catch block. Swallowing everything into a plain response
      // would silently break both key rotation and failover.
      const status = (error as { status?: number })?.status;
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
