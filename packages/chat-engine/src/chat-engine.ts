import { AIManager } from "@ai-chat-platform/ai-manager";
import { ChatSession } from "./session";
import { PromptBuilder } from "./prompt-builder";

export class ChatEngine {
  constructor(
    private readonly ai: AIManager,
    private readonly promptBuilder = new PromptBuilder()
  ) {}

  async send(session: ChatSession, message: string) {
    session.conversation.add({
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: new Date(),
    });

    const prompt = this.promptBuilder.build(
      session.conversation.history()
    );

    const result = await this.ai.chat(prompt);

    session.conversation.add({
      id: crypto.randomUUID(),
      role: "assistant",
      content: result.response,
      createdAt: new Date(),
    });

    return result;
  }
}