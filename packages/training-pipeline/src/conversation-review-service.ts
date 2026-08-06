import { prisma } from "@ai-chat-platform/database";

export interface ConversationReviewRecord {
  conversationId: string;
  businessId: string;
  decision: "add" | "drop" | null;
  qaVerdict: "pass" | "fail" | null;
  qaNote: string | null;
  analyzedAt: string | null;
}

function toRecord(row: {
  conversationId: string;
  businessId: string;
  decision: string | null;
  qaVerdict: string | null;
  qaNote: string | null;
  analyzedAt: Date | null;
}): ConversationReviewRecord {
  return {
    conversationId: row.conversationId,
    businessId: row.businessId,
    decision: row.decision === "add" || row.decision === "drop" ? row.decision : null,
    qaVerdict: row.qaVerdict === "pass" || row.qaVerdict === "fail" ? row.qaVerdict : null,
    qaNote: row.qaNote,
    analyzedAt: row.analyzedAt?.toISOString() ?? null,
  };
}

/** Purely manual, human-entered per-conversation state for the Chat
 * Learning workflow — no LLM ever writes to this table. Upsert-based:
 * one row per conversation, always reflecting the latest human decision
 * rather than a history of changes (unlike AiConfigVersion, there's no
 * need to keep every past edit of "is this chat worth training on"). */
export class ConversationReviewService {
  async listForBusiness(businessId: string): Promise<ConversationReviewRecord[]> {
    const rows = await prisma.conversationReview.findMany({ where: { businessId } });
    return rows.map(toRecord);
  }

  /** businessId always comes from the conversation itself, never from
   * whichever dashboard view the click happened in — the mother
   * dashboard's Chat Learning tab shows every client's chats in one
   * list, so trusting a caller-supplied businessId here would tag a
   * client's conversation under "__platform__" (or vice versa) and make
   * it invisible to that client's own Chat Learning tab. */
  private async businessIdFor(conversationId: string): Promise<string> {
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { businessId: true },
    });
    return conversation.businessId;
  }

  async setDecision(conversationId: string, decision: "add" | "drop" | null): Promise<ConversationReviewRecord> {
    const businessId = await this.businessIdFor(conversationId);
    const row = await prisma.conversationReview.upsert({
      where: { conversationId },
      create: { conversationId, businessId, decision },
      update: { decision },
    });
    return toRecord(row);
  }

  async setQa(
    conversationId: string,
    qaVerdict: "pass" | "fail" | null,
    qaNote: string | null
  ): Promise<ConversationReviewRecord> {
    const businessId = await this.businessIdFor(conversationId);
    const row = await prisma.conversationReview.upsert({
      where: { conversationId },
      create: { conversationId, businessId, qaVerdict, qaNote },
      update: { qaVerdict, qaNote },
    });
    return toRecord(row);
  }

  /** Stamps every included conversation as analyzed — so the Chat
   * Learning UI can distinguish "already sent through a run" from
   * freshly-added chats without forcing a re-run. */
  async markAnalyzed(conversationIds: string[]): Promise<void> {
    await prisma.conversationReview.updateMany({
      where: { conversationId: { in: conversationIds } },
      data: { analyzedAt: new Date() },
    });
  }
}
