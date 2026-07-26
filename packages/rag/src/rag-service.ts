import { ChatService } from "@ai-chat-platform/chat-service";

import type {
  AskRequest,
  AskResponse,
} from "./types";

export class RagService {

  constructor(
    private readonly chat: ChatService
  ) {}

  async ask(
    request: AskRequest
  ): Promise<AskResponse> {

    const response =
      await this.chat.chat({
        sessionId: request.sessionId,
        message: request.message,
      });

    return {
      answer: response.answer,
    };
  }
}