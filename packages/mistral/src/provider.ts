import { DEFAULT_MODEL } from "./models";
import type { AIProvider, AIRequest, AIResponse } from "@ai-chat-platform/types";
import { InvalidApiKeyError, RateLimitedError } from "@ai-chat-platform/types";

// OpenAI-compatible Chat Completions endpoint — same shape as OpenRouter/Cerebras.
const ENDPOINT = "https://api.mistral.ai/v1/chat/completions";

interface MistralResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
}

export class MistralProvider implements AIProvider {
  readonly name = "mistral";

  async generate(request: AIRequest, apiKey?: string): Promise<AIResponse> {
    if (!apiKey) {
      return {
        success: false,
        provider: this.name,
        message: "",
        error: "No API key provided",
      };
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          ...(request.systemPrompt
            ? [{ role: "system", content: request.systemPrompt }]
            : []),
          { role: "user", content: request.message },
        ],
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        // Mistral's API rejects any top_p other than 1 once temperature
        // is 0 (greedy sampling) -- "top_p must be 1 when using greedy
        // sampling" -- so every business with temperature=0 (Malamal's
        // actual config) hard-failed this provider on every call.
        // Omitting top_p here just means "use the API's own default",
        // same as every other optional field below.
        ...(request.temperature === 0 ? {} : { top_p: request.topP }),
        frequency_penalty: request.frequencyPenalty,
        presence_penalty: request.presencePenalty,
        stop: request.stop,
        seed: request.seed,
      }),
    });

    if (!res.ok) {
      // Same reasoning as every other provider in this catalog: must
      // throw the typed errors so AIManager's key-health/failover logic
      // (which only runs in its catch block) actually fires.
      const body = await res.text().catch(() => "");
      const message = `Mistral request failed (${res.status}): ${body}`;

      if (res.status === 401 || res.status === 403) {
        throw new InvalidApiKeyError(message);
      }

      if (res.status === 429) {
        throw new RateLimitedError(message);
      }

      throw new Error(message);
    }

    const data = (await res.json()) as MistralResponse;

    return {
      success: true,
      provider: this.name,
      message: data.choices?.[0]?.message?.content ?? "",
      tokens: data.usage?.total_tokens ?? 0,
    };
  }

  async health(): Promise<boolean> {
    return true;
  }
}
