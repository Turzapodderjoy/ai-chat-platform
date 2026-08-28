import { ConversationService, ConversationNoteService } from "@ai-chat-platform/conversation";
import { CHANNEL_CATALOG } from "@ai-chat-platform/channel-catalog";
import type { ChannelConnectionService } from "@ai-chat-platform/channel-connections";

export interface HandoffSummary {
  sessionId: string;
  status: string;
  reason: string | null;
  summary: string | null;
  requestedAt: string | null;
  lastMessage: string;
  customerName: string | null;
  externalUserId: string | null;
}

export class HandoffController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly channelConnections: ChannelConnectionService,
    private readonly notes: ConversationNoteService
  ) {}

  async list(businessId?: string): Promise<HandoffSummary[]> {
    const conversations = await this.conversations.listHandoffs(businessId);

    const pendingOrders = new Map(conversations.map((c) => [c.id, c.pendingOrder]));
    const names = await this.conversations.namesForConversations(
      conversations.map((c) => c.id),
      pendingOrders
    );

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
          customerName: names.get(conversation.id) ?? null,
          externalUserId: conversation.externalUserId,
        };
      })
    );
  }

  /** Every conversation for the unified All Chats inbox — not filtered to
   * only ones needing a human, unlike list() above. */
  listAll(params: {
    businessId?: string;
    channel?: string;
    needsHandoffOnly?: boolean;
    sort?: "newest" | "oldest";
    cursor?: string;
    limit?: number;
    includeTraining?: boolean;
    assignedAgentId?: string | "unassigned";
  }) {
    return this.conversations.listAllConversations(params);
  }

  /** businessId + assignedAgentId only -- used by the client-scoped
   * /api/client/inbox/* routes to verify a caller (owner or agent) is
   * actually allowed to touch this conversation before reply/status/
   * messages, without ever trusting a client-supplied businessId. */
  async getConversationMeta(sessionId: string) {
    const conversation = await this.conversations.get(sessionId);
    if (!conversation) return null;
    return { businessId: conversation.businessId, assignedAgentId: conversation.assignedAgentId };
  }

  async messages(sessionId: string) {
    const conversation = await this.conversations.get(sessionId);

    if (!conversation) {
      throw new Error("Session not found");
    }

    return this.conversations.history(sessionId, 100);
  }

  /** Saves the agent's reply, then — for a channel-originated conversation
   * (Messenger/Instagram/WhatsApp) — actually delivers it to the customer
   * through that channel's own Send API. Previously this only wrote to
   * the database: a real customer on those channels got no reply at all
   * once a human took over, since nothing called back out to Meta/
   * WhatsApp's API. Website conversations have no external channel to
   * deliver to, so they're just saved, same as before. */
  async reply(sessionId: string, message: string): Promise<{ ok: true }> {
    const conversation = await this.conversations.get(sessionId);

    await this.conversations.sendAgentMessage(sessionId, message);

    if (conversation && conversation.channel !== "website" && conversation.externalUserId) {
      const entry = CHANNEL_CATALOG.find((c) => c.id === conversation.channel);
      const connection = await this.channelConnections.forBusinessAndChannel(
        conversation.businessId,
        conversation.channel
      );

      if (entry?.sendMessage && connection) {
        await entry.sendMessage(connection, conversation.externalUserId, message);
      }
    }

    return { ok: true };
  }

  /** "Stop AI"/"Resume AI" in the dashboard — a direct status flip with
   * no message involved, unlike reply() above which always sends one.
   * "human" pins it to a person exactly like reply() does, just without
   * requiring the agent to type something first; "bot" hands it back. */
  async setStatus(sessionId: string, status: "bot" | "pending" | "human"): Promise<{ ok: true }> {
    await this.conversations.setHandoffStatus(sessionId, status);
    return { ok: true };
  }

  async setAssignedAgent(sessionId: string, agentId: string | null): Promise<{ ok: true }> {
    await this.conversations.setAssignedAgent(sessionId, agentId);
    return { ok: true };
  }

  listNotes(conversationId: string) {
    return this.notes.list(conversationId);
  }

  async addNote(params: { conversationId: string; author: string; body: string }) {
    const conversation = await this.conversations.get(params.conversationId);
    if (!conversation) {
      throw new Error("Session not found");
    }
    return this.notes.add({ conversationId: params.conversationId, businessId: conversation.businessId, author: params.author, body: params.body });
  }

  deleteNote(id: string) {
    return this.notes.delete(id);
  }
}
