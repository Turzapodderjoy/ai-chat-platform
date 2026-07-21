import Groq from "groq-sdk";
import type { AIProvider } from "@ai-chat-platform/ai-manager";

export class GroqProvider implements AIProvider {
  name = "Groq";

  private client: Groq;

  constructor() {
    this.client = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  async health(): Promise<boolean> {
    return true;
  }

  async chat(message: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    });

    return completion.choices[0].message.content ?? "";
  }
}