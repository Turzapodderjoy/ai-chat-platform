import type { AIProvider, AIRequest, AIResponse } from "@ai-chat-platform/types";
import { InvalidApiKeyError, RateLimitedError } from "../errors";

interface MockProviderOptions {
  name: string;
  failFirstNCalls?: number;
  failureReason?: "rate_limited" | "invalid_key" | "provider_unavailable";
}

export class MockProvider implements AIProvider {
  readonly name: string;
  private remainingFailures: number;
  private readonly failureReason: MockProviderOptions["failureReason"];

  constructor(options: MockProviderOptions) {
    this.name = options.name;
    this.remainingFailures = options.failFirstNCalls ?? 0;
    this.failureReason = options.failureReason ?? "rate_limited";
  }

  async generate(request: AIRequest, apiKey?: string): Promise<AIResponse> {
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;

      if (this.failureReason === "rate_limited") {
        throw new RateLimitedError(`Provider ${this.name} is rate limited.`);
      }

      if (this.failureReason === "invalid_key") {
        throw new InvalidApiKeyError(`Provider ${this.name} rejected the API key.`);
      }

      return {
        success: false,
        provider: this.name,
        message: "",
        error: `Provider ${this.name} is unavailable.`,
      };
    }

    return {
      success: true,
      provider: this.name,
      message: `Mock response from ${this.name}`,
      tokens: 0,
    };
  }
}
