import type { AIProvider, AIRequest, AIResponse } from "@ai-chat-platform/types";
import { InvalidApiKeyError, RateLimitedError } from "@ai-chat-platform/types";

interface ChatCompletionsResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
}

/**
 * Any user-added provider that speaks the standard OpenAI-compatible
 * /chat/completions shape — which covers the overwhelming majority of
 * newly-released providers (this is the exact same request/response shape
 * already used by OpenRouter/Cerebras/Mistral, just with a configurable
 * base URL and model instead of one hardcoded per package). Lets a new
 * vendor be added from the dashboard without writing a new npm package
 * and adapter class for every single one.
 */
export class CustomOpenAICompatibleProvider implements AIProvider {
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly model: string
  ) {}

  async generate(request: AIRequest, apiKey?: string): Promise<AIResponse> {
    if (!apiKey) {
      return {
        success: false,
        provider: this.name,
        message: "",
        error: "No API key provided",
      };
    }

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(request.systemPrompt
            ? [{ role: "system", content: request.systemPrompt }]
            : []),
          { role: "user", content: request.message },
        ],
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        top_p: request.topP,
        frequency_penalty: request.frequencyPenalty,
        presence_penalty: request.presencePenalty,
        stop: request.stop,
        seed: request.seed,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const message = `${this.name} request failed (${res.status}): ${body}`;

      if (res.status === 401 || res.status === 403) {
        throw new InvalidApiKeyError(message);
      }

      if (res.status === 429) {
        throw new RateLimitedError(message);
      }

      throw new Error(message);
    }

    const data = (await res.json()) as ChatCompletionsResponse;

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
