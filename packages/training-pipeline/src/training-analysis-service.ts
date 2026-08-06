import { prisma } from "@ai-chat-platform/database";
import type { AiConfigService } from "@ai-chat-platform/ai-config";
import type { MessageFeedbackService } from "@ai-chat-platform/conversation";

import { GeminiBatchClient } from "./gemini-batch-client";
import { ConversationReviewService } from "./conversation-review-service";
import { BATCH_ANALYSIS_SYSTEM_PROMPT, buildBatchAnalysisUserPrompt, type BatchAnalysisConversation } from "./system-prompt";

export interface TrainingAnalysisRunRecord {
  id: string;
  businessId: string;
  conversationIds: string[];
  report: string;
  createdAt: string;
}

function toRunRecord(row: { id: string; businessId: string; conversationIds: string; report: string; createdAt: Date }): TrainingAnalysisRunRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    conversationIds: row.conversationIds ? row.conversationIds.split(",") : [],
    report: row.report,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Orchestrates the one human-triggered action left in this pipeline:
 * take a human-curated batch of conversations (each already marked
 * "add" in ConversationReview, with whatever pass/fail + notes the human
 * left), hand the whole batch to Gemini in one call, and store the
 * resulting findings report. Never writes to AiConfigVersion — the
 * human reads the report and edits the AI Brain prompt themselves. */
export class TrainingAnalysisService {
  constructor(
    private readonly gemini: GeminiBatchClient,
    private readonly aiConfig: AiConfigService,
    private readonly messageFeedback: MessageFeedbackService,
    private readonly reviews: ConversationReviewService
  ) {}

  async runBatch(businessId: string, conversationIds: string[]): Promise<TrainingAnalysisRunRecord> {
    if (conversationIds.length === 0) {
      throw new Error("Select at least one conversation to analyze.");
    }

    const [aiConfig, conversations, reviewRows] = await Promise.all([
      this.aiConfig.getCurrent(businessId),
      prisma.conversation.findMany({
        where: { id: { in: conversationIds } },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      }),
      this.reviews.listForBusiness(businessId),
    ]);

    const reviewByConversationId = new Map(reviewRows.map((r) => [r.conversationId, r]));
    const allMessageIds = conversations.flatMap((c) => c.messages.map((m) => m.id));
    const feedbackByMessageId = await this.messageFeedback.forMessageIds(allMessageIds);

    const batch: BatchAnalysisConversation[] = conversations.map((conversation, i) => {
      const review = reviewByConversationId.get(conversation.id);

      const transcript = conversation.messages
        .map((m) => {
          const feedback = feedbackByMessageId.get(m.id);
          if (!feedback) return `${m.role}: ${m.content}`;

          const annotation =
            feedback.verdict === "fail"
              ? `[Human QA: FAIL${feedback.note ? ` — ${feedback.note}` : ""}]`
              : "[Human QA: PASS]";

          return `${m.role}: ${m.content} ${annotation}`;
        })
        .join("\n");

      return {
        index: i + 1,
        conversationId: conversation.id,
        channel: conversation.channel,
        qaVerdict: review?.qaVerdict ?? null,
        qaNote: review?.qaNote ?? null,
        transcript,
      };
    });

    const userPrompt = buildBatchAnalysisUserPrompt({ aiBrainSystemPrompt: aiConfig.systemPrompt, conversations: batch });
    const report = await this.gemini.analyze(BATCH_ANALYSIS_SYSTEM_PROMPT, userPrompt);

    const created = await prisma.trainingAnalysisRun.create({
      data: { businessId, conversationIds: conversationIds.join(","), report },
    });

    await this.reviews.markAnalyzed(conversationIds);

    return toRunRecord(created);
  }

  async listRuns(businessId?: string, limit = 50): Promise<TrainingAnalysisRunRecord[]> {
    const rows = await prisma.trainingAnalysisRun.findMany({
      where: businessId ? { businessId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(toRunRecord);
  }

  async getRun(id: string): Promise<TrainingAnalysisRunRecord | null> {
    const row = await prisma.trainingAnalysisRun.findUnique({ where: { id } });
    return row ? toRunRecord(row) : null;
  }
}
