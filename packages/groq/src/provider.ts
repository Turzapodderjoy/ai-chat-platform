import Groq from "groq-sdk";
import { DEFAULT_MODEL } from "./models";
import type { AIProvider, AIRequest, AIResponse } from "@ai-chat-platform/types";

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
        messages: [{ role: "user", content: request.message }],
      });

      return {
        success: true,
        provider: this.name,
        message: response.choices[0]?.message?.content ?? "",
        tokens: response.usage?.total_tokens ?? 0,
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        message: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async health(): Promise<boolean> {
    return true;
  }
}