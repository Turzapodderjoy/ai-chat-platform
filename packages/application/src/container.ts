import { AIManager } from "@ai-chat-platform/ai-manager";
import { PromptEngine } from "@ai-chat-platform/prompt-engine";
import type { Retriever } from "@ai-chat-platform/retriever";
import { ChatService } from "@ai-chat-platform/chat-service";
import { UploadService } from "@ai-chat-platform/upload";

export interface ApplicationServices {
  aiManager: AIManager;
  promptEngine: PromptEngine;
  retriever: Retriever;
  chatService: ChatService;
  uploadService: UploadService;
}

export class ApplicationContainer {
  constructor(
    private readonly services: ApplicationServices
  ) {}

  get aiManager() {
    return this.services.aiManager;
  }

  get promptEngine() {
    return this.services.promptEngine;
  }

  get retriever() {
    return this.services.retriever;
  }

  get chatService() {
    return this.services.chatService;
  }

  get uploadService() {
    return this.services.uploadService;
  }
}