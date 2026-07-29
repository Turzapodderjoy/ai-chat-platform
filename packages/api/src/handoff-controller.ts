import { ConversationService } from "@ai-chat-platform/conversation";

export interface HandoffSummary {
  sessionId: string;
  status: string;
  reason: string | null;
  summary: string | null;
  requestedAt: string | null;
  lastMessage: string;
}

export class HandoffController {
  constructor(
    private readonly conversations: ConversationService
  ) {}

  async list(businessId?: string): Promise<HandoffSummary[]> {
    const conversations = await this.conversations.listHandoffs(businessId);

    return Promise.all(
      conversations.map(async (conversation) => {
        const history = await this.conversations.history(conversation.id);

        return {
          sessionId: conversation.id,
          status: conversation.handoffStatus,
          reason: conversation.handoffReason,
          summary: conversation.handoffSummary,
          requestedAt: conversation.handoffRequestedAt?.toISOString() ?? null,
          lastMessage: history.at(-1)?.content ?? "",
        };
      })
    );
  }

  async messages(sessionId: string) {
    const conversation = await this.conversations.get(sessionId);

    if (!conversation) {
      throw new Error("Session not found");
    }

    return this.conversations.history(sessionId, 100);
  }

  async reply(sessionId: string, message: string): Promise<{ ok: true }> {
    await this.conversations.sendAgentMessage(sessionId, message);
    return { ok: true };
  }
}
