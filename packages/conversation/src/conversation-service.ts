import { prisma } from "@ai-chat-platform/database";

import type {
  ConversationMessage,
  ConversationRecord,
  HandoffStatus,
} from "./types";

type ConversationRow = {
  id: string;
  businessId: string;
  userId: string;
  channel: string;
  externalUserId: string | null;
  handoffStatus: string;
  handoffReason: string | null;
  handoffSummary: string | null;
  handoffRequestedAt: Date | null;
  isTraining: boolean;
};

function toRecord(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    userId: row.userId,
    channel: row.channel,
    externalUserId: row.externalUserId,
    handoffStatus: row.handoffStatus.toLowerCase() as HandoffStatus,
    handoffReason: row.handoffReason,
    handoffSummary: row.handoffSummary,
    handoffRequestedAt: row.handoffRequestedAt,
    isTraining: row.isTraining,
  };
}

export class ConversationService {

  async getOrCreate(
    sessionId: string,
    businessId: string,
    userId: string,
    isTraining = false,
    channel = "website",
    externalUserId: string | null = null
  ): Promise<ConversationRecord> {

    const existing = await prisma.conversation.findUnique({
      where: { id: sessionId },
    });

    if (existing) {
      return toRecord(existing);
    }

    const created = await prisma.conversation.create({
      data: { id: sessionId, businessId, userId, isTraining, channel, externalUserId },
    });

    return toRecord(created);
  }

  async get(sessionId: string): Promise<ConversationRecord | null> {
    const row = await prisma.conversation.findUnique({
      where: { id: sessionId },
    });

    return row ? toRecord(row) : null;
  }

  /** Returns the created row's id — callers that record an assistant
   * reply (ChatService) thread this back to the client so the Chat Demo
   * tab's QA pass/fail buttons can attach feedback to the exact message. */
  async addMessage(
    sessionId: string,
    role: ConversationMessage["role"],
    content: string,
    provider?: string
  ): Promise<{ id: string }> {
    const created = await prisma.message.create({
      data: { conversationId: sessionId, role, content, provider: provider ?? null },
    });
    return { id: created.id };
  }

  async history(
    sessionId: string,
    limit = 50
  ): Promise<ConversationMessage[]> {
    const rows = await prisma.message.findMany({
      where: { conversationId: sessionId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      role: row.role as ConversationMessage["role"],
      content: row.content,
      provider: row.provider,
      createdAt: row.createdAt,
    }));
  }

  async requestHandoff(
    sessionId: string,
    reason: string,
    summary: string
  ): Promise<void> {
    await prisma.conversation.update({
      where: { id: sessionId },
      data: {
        handoffStatus: "PENDING",
        handoffReason: reason,
        handoffSummary: summary,
        handoffRequestedAt: new Date(),
      },
    });
  }

  async listHandoffs(businessId?: string): Promise<ConversationRecord[]> {
    const rows = await prisma.conversation.findMany({
      where: {
        handoffStatus: { not: "BOT" },
        // A Training Arena session's whole point can be deliberately
        // provoking a handoff to correct it — that's not a real customer
        // waiting on an agent, so it shouldn't show up in the queue.
        isTraining: false,
        ...(businessId ? { businessId } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });

    return rows.map(toRecord);
  }

  /** Real conversation count for a business — excludes Training Arena
   * sessions, same reasoning as listAllConversations' default. */
  async countConversations(businessId: string): Promise<number> {
    return prisma.conversation.count({ where: { businessId, isTraining: false } });
  }

  async sendAgentMessage(sessionId: string, message: string): Promise<void> {
    await prisma.message.create({
      data: { conversationId: sessionId, role: "agent", content: message },
    });

    await prisma.conversation.update({
      where: { id: sessionId },
      data: { handoffStatus: "HUMAN" },
    });
  }

  /** Deletes every conversation for a business — messages cascade via
   * the schema's onDelete: Cascade. Used when a client is removed. */
  async deleteByBusinessId(businessId: string): Promise<void> {
    await prisma.conversation.deleteMany({ where: { businessId } });
  }

  /** Past Training Arena sessions for the Intercom-style sidebar — most
   * recent first, with a preview of the last message and whether a human
   * has touched this session yet in Chat Learning (any ConversationReview
   * row at all, decided or not). */
  async listTrainingSessions(businessId: string): Promise<
    Array<{
      id: string;
      updatedAt: Date;
      messageCount: number;
      lastMessage: string | null;
      reviewed: boolean;
    }>
  > {
    const rows = await prisma.conversation.findMany({
      where: { businessId, isTraining: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        conversationReview: { select: { id: true } },
        _count: { select: { messages: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      updatedAt: row.updatedAt,
      messageCount: row._count.messages,
      lastMessage: row.messages[0]?.content ?? null,
      reviewed: row.conversationReview !== null,
    }));
  }

  /** Every real conversation (bot-handled and handed-off alike) for the
   * unified All Chats inbox — unlike listHandoffs, this is not filtered
   * to only conversations needing a human. Excludes Training Arena
   * sessions by default, same reasoning as listHandoffs — pass
   * includeTraining to also surface them, which only Chat Learning does
   * (it curates real chats and Training Arena sessions in one list). */
  async listAllConversations(params: {
    businessId?: string;
    channel?: string;
    needsHandoffOnly?: boolean;
    sort?: "newest" | "oldest";
    cursor?: string;
    limit?: number;
    includeTraining?: boolean;
  }): Promise<{
    conversations: Array<{
      id: string;
      businessId: string;
      channel: string;
      handoffStatus: HandoffStatus;
      updatedAt: Date;
      messageCount: number;
      lastMessage: string | null;
    }>;
    nextCursor: string | null;
  }> {
    const limit = params.limit ?? 50;

    const rows = await prisma.conversation.findMany({
      where: {
        ...(params.includeTraining ? {} : { isTraining: false }),
        ...(params.businessId ? { businessId: params.businessId } : {}),
        ...(params.channel ? { channel: params.channel } : {}),
        ...(params.needsHandoffOnly ? { handoffStatus: { not: "BOT" } } : {}),
      },
      orderBy: { updatedAt: params.sort === "oldest" ? "asc" : "desc" },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      conversations: page.map((row) => ({
        id: row.id,
        businessId: row.businessId,
        channel: row.channel,
        handoffStatus: row.handoffStatus.toLowerCase() as HandoffStatus,
        updatedAt: row.updatedAt,
        messageCount: row._count.messages,
        lastMessage: row.messages[0]?.content ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }
}
