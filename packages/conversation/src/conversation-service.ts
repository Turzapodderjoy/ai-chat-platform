import { prisma, Prisma } from "@ai-chat-platform/database";

import type {
  ConversationMessage,
  ConversationRecord,
  HandoffStatus,
  MessageSource,
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
  pendingOrder: unknown;
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
    pendingOrder: (row.pendingOrder as Record<string, string> | null) ?? null,
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
    provider?: string,
    sources?: MessageSource[],
    confidence?: number
  ): Promise<{ id: string }> {
    const created = await prisma.message.create({
      data: {
        conversationId: sessionId,
        role,
        content,
        provider: provider ?? null,
        sources: sources && sources.length > 0 ? (sources as unknown as Prisma.InputJsonValue) : undefined,
        confidence: confidence ?? null,
      },
    });
    return { id: created.id };
  }

  async history(
    sessionId: string,
    limit = 50
  ): Promise<ConversationMessage[]> {
    // Most recent `limit` messages, not the oldest — `orderBy: asc` with
    // `take` always returns the FIRST N rows ever written, so once a
    // conversation passed historyTurns messages the model was frozen
    // seeing only the start of the chat and never anything after,
    // forever. Confirmed live: a multi-item order (drill + tape +
    // screwdriver) resolved past message ~10 kept reverting to
    // "which ones will you take?" because from the model's (wrong)
    // point of view, that resolution had never happened. Query newest-
    // first with `take`, then reverse back to chronological order.
    const rows = await prisma.message.findMany({
      where: { conversationId: sessionId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    rows.reverse();

    return rows.map((row) => ({
      id: row.id,
      role: row.role as ConversationMessage["role"],
      content: row.content,
      provider: row.provider,
      sources: (row.sources as unknown as MessageSource[] | null) ?? null,
      confidence: row.confidence,
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

  /** See Conversation.pendingOrder's own schema comment — the 5 order
   * fields once collected, waiting on the customer's plain confirmation.
   * null clears it (order finalized, or the customer said something that
   * wasn't a confirmation). */
  async setPendingOrder(sessionId: string, order: Record<string, string> | null): Promise<void> {
    await prisma.conversation.update({
      where: { id: sessionId },
      data: { pendingOrder: order ?? Prisma.JsonNull },
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

  /** Best-known customer name for a batch of conversations — an
   * in-progress order draft (pendingOrder) if one's being collected right
   * now, else the name from that conversation's most recent finalized
   * Order (pendingOrder gets cleared once the order's created, so this is
   * the only place the name survives after that point), else — for a
   * repair-tracking conversation, whose id IS the RepairAppointment's own
   * trackingToken (see RepairController) — the name on that appointment.
   * One query per source for the whole batch rather than N+1. */
  async namesForConversations(
    conversationIds: string[],
    pendingOrders: Map<string, Record<string, string> | null>
  ): Promise<Map<string, string | null>> {
    const names = new Map<string, string | null>();
    if (conversationIds.length === 0) return names;

    const orders = await prisma.order.findMany({
      where: { conversationId: { in: conversationIds } },
      orderBy: { createdAt: "desc" },
      select: { conversationId: true, customerName: true },
    });

    const repairs = await prisma.repairAppointment.findMany({
      where: { trackingToken: { in: conversationIds } },
      select: { trackingToken: true, customerName: true },
    });

    for (const id of conversationIds) {
      const pendingName = pendingOrders.get(id)?.customerName;
      names.set(
        id,
        pendingName ||
          orders.find((o) => o.conversationId === id)?.customerName ||
          repairs.find((r) => r.trackingToken === id)?.customerName ||
          null
      );
    }

    return names;
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

    // Refreshed on every agent reply, not just the first — an agent
    // actively engaged with this conversation right now means it's not
    // stale, so the 2-hour auto-resume clock (see chat-service.ts's
    // HANDOFF_STALE_MS) restarts from here, not from whenever the
    // handoff was first requested.
    await prisma.conversation.update({
      where: { id: sessionId },
      data: { handoffStatus: "HUMAN", handoffRequestedAt: new Date() },
    });
  }

  /** Direct handoffStatus flip, no message involved — powers the
   * dashboard's "Stop AI"/"Resume AI" buttons. "human" pins the
   * conversation to a real agent the same way sendAgentMessage does,
   * without requiring the agent to actually type something first;
   * "bot" hands it back to the AI. */
  async setHandoffStatus(sessionId: string, status: "bot" | "pending" | "human"): Promise<void> {
    await prisma.conversation.update({
      where: { id: sessionId },
      data: {
        handoffStatus: status.toUpperCase() as "BOT" | "PENDING" | "HUMAN",
        handoffRequestedAt: status === "bot" ? null : new Date(),
      },
    });
  }

  /** Deletes every conversation for a business — messages cascade via
   * the schema's onDelete: Cascade. Used when a client is removed. */
  async deleteByBusinessId(businessId: string): Promise<void> {
    await prisma.conversation.deleteMany({ where: { businessId } });
  }

  /** Single conversation — messages cascade via the schema's
   * onDelete: Cascade. deleteMany (not delete) so it's a no-op rather
   * than throwing if the conversation doesn't exist. */
  async deleteConversation(id: string): Promise<void> {
    await prisma.conversation.deleteMany({ where: { id } });
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
      externalUserId: string | null;
      customerName: string | null;
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

    const pendingOrders = new Map(
      page.map((row) => [row.id, (row.pendingOrder as Record<string, string> | null) ?? null])
    );
    const names = await this.namesForConversations(page.map((row) => row.id), pendingOrders);

    return {
      conversations: page.map((row) => ({
        id: row.id,
        businessId: row.businessId,
        channel: row.channel,
        externalUserId: row.externalUserId,
        customerName: names.get(row.id) ?? null,
        handoffStatus: row.handoffStatus.toLowerCase() as HandoffStatus,
        updatedAt: row.updatedAt,
        messageCount: row._count.messages,
        lastMessage: row.messages[0]?.content ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }
}
