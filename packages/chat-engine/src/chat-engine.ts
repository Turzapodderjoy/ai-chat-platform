import { AIManager } from "@ai-chat-platform/ai-manager";
import { KnowledgeBase } from "@ai-chat-platform/knowledge-base";
import { PromptEngine } from "@ai-chat-platform/prompt-engine";

export class ChatEngine {
  constructor(
    private readonly ai: AIManager,
    private readonly kb: KnowledgeBase,
    private readonly prompt: PromptEngine
  ) {}

  async chat(userMessage: string) {
    const context = this.kb.search(userMessage);

    const finalPrompt =
      this.prompt.buildPrompt(
        context,
        userMessage
      );

    const result =
      await this.ai.chat(finalPrompt);

    return result;
  }
}