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
        businessId: request.businessId,
        isTraining: request.isTraining,
        channel: request.channel,
        externalUserId: request.externalUserId,
        languageHint: request.languageHint,
      });

    return {
      answer: response.answer,
      provider: response.provider,
      tokens: response.tokens,
      confidence: response.confidence,
      cached: response.cached,
      handoff: response.handoff,
      messageId: response.messageId,
      sources: response.sources,
    };
  }
}