import { ChatService } from "@ai-chat-platform/chat-service";

export class ChatController {
  constructor(
    private readonly chat: ChatService
  ) {}

  post(
    sessionId: string,
    message: string,
    businessId?: string,
    isTraining?: boolean,
    languageHint?: string,
    imageUrl?: string
  ) {
    return this.chat.chat({
      sessionId,
      message,
      businessId,
      isTraining,
      languageHint,
      imageUrl,
    });
  }
}