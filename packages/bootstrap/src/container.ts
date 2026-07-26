import { AIManager } from "@ai-chat-platform/ai-manager";
import { PromptEngine } from "@ai-chat-platform/prompt-engine";
import { ConversationService } from "@ai-chat-platform/conversation";
import type { Retriever } from "@ai-chat-platform/retriever";
import { ChatService } from "@ai-chat-platform/chat-service";
import { RagService } from "@ai-chat-platform/rag";
import { ChatController } from "@ai-chat-platform/api";
import { HealthController } from "@ai-chat-platform/api";
import { ApiRouter } from "@ai-chat-platform/api";

export class Container {

  constructor(
    retriever: Retriever
  ) {

    const conversations =
      new ConversationService();

    const prompts =
      new PromptEngine();

    const ai =
      new AIManager();

    const chat =
      new ChatService(
        conversations,
        retriever,
        prompts,
        ai
      );

    const rag =
      new RagService(chat);

    this.router =
      new ApiRouter(
        new ChatController(rag),
        {} as never,
        new HealthController()
      );
  }

  readonly router: ApiRouter;
}