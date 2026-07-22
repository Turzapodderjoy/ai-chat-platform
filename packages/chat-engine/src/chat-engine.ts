import { AIManager } from "@ai-chat-platform/ai-manager";
import { KnowledgeBase } from "@ai-chat-platform/knowledge-base";

import { ChatSession } from "./session";
import { PromptBuilder } from "./prompt-builder";

export class ChatEngine {
  constructor(
    private readonly ai: AIManager,
    private readonly kb: KnowledgeBase,
    private readonly promptBuilder = new PromptBuilder()
  ) {}

  async send(session: ChatSession, message: string) {
    session.conversation.add({
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: new Date(),
    });

    const context = this.kb.search(message);

    const prompt = this.promptBuilder.build(
      session.conversation.history(),
      context
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