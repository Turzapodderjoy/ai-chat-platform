import { prisma } from "@ai-chat-platform/database";

export interface ChatAnalysisRecord {
  id: string;
  conversationId: string;
  businessId: string;
  verdict: string;
  findings: string;
  createdAt: string;
}

export interface TrainingExampleRecord {
  id: string;
  chatAnalysisId: string;
  businessId: string;
  instruction: string;
  input: string;
  output: string;
  createdAt: string;
}

export interface PromptSuggestionRecord {
  id: string;
  businessId: string;
  /** "pipeline" | "training_arena" | "dumped_chat" — which tool produced
   * this suggestion. */
  source: string;
  kind: string;
  proposedSystemPrompt: string | null;
  proposedAppendText: string | null;
  reasoning: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
}

/** Prisma-backed persistence for the training pipeline's three tables —
 * same shape as AiConfigService (packages/ai-config): plain CRUD, no
 * business logic about WHEN to analyze or suggest (that's
 * ChatAnalysisPipeline/PromptSuggestionService's job). */
export class ChatAnalysisService {
  /** Conversations not yet analyzed, with enough real back-and-forth to
   * be worth analyzing (at least 3 messages — a lone greeting or an
   * abandoned first message isn't useful training signal). */
  /** Pages through unprocessed conversations (oldest first) looking for
   * ones with real back-and-forth (≥3 messages) until it finds `limit`
   * of them or runs out. A single fixed-size over-fetch isn't enough in
   * practice — plenty of real (and test) traffic is a single one-shot
   * question+answer (exactly 2 messages), and if a long enough run of
   * those sorts before anything longer, a naive one-shot fetch+filter
   * can come back completely empty even though qualifying conversations
   * exist further down. Short conversations are marked processed as
   * they're skipped (with a lightweight, no-LLM-call ChatAnalysis row)
   * so they don't get rescanned by every future run forever. */
  async unprocessedConversations(limit: number): Promise<
    Array<{ id: string; businessId: string; messages: { id: string; role: string; content: string }[] }>
  > {
    const PAGE_SIZE = 50;
    const MAX_PAGES = 10; // caps a single cron run's scan at 500 conversations

    const qualifying: Array<{
      id: string;
      businessId: string;
      messages: { id: string; role: string; content: string }[];
    }> = [];

    // Conversations pushed into `qualifying` don't get marked processed
    // here — that happens later, once the pipeline actually analyzes
    // them. Without tracking which ids this call has already seen, every
    // subsequent page re-runs the SAME "processedForTraining: false"
    // query (no cursor) and refetches the exact same still-unprocessed
    // qualifying conversations, duplicating them into the list — a real
    // bug found live: the same conversation got attempted 5+ times in
    // one run, wasting the reasoning LLM's shared rate-limit budget on
    // redundant retries and crashing on ChatAnalysis's unique
    // conversationId constraint the first time one of the duplicates
    // happened to succeed.
    const seenIds = new Set<string>();

    for (let page = 0; page < MAX_PAGES && qualifying.length < limit; page++) {
      const conversations = await prisma.conversation.findMany({
        where: {
          processedForTraining: false,
          messages: { some: {} },
          id: seenIds.size > 0 ? { notIn: [...seenIds] } : undefined,
        },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "asc" },
        take: PAGE_SIZE,
      });

      if (conversations.length === 0) {
        break; // no more unprocessed conversations at all
      }

      for (const c of conversations) {
        seenIds.add(c.id);
        // A 1-2 message exchange is normally skipped as too short to
        // learn from — but an admin QA'ing exactly that exchange in the
        // Chat Demo tab (one question, one answer, one Pass/Fail click)
        // is exactly a 2-message conversation, and that explicit human
        // judgment is too valuable a signal to auto-skip before the
        // reasoning LLM ever sees it.
        const hasFeedback =
          c.messages.length > 0 &&
          (await prisma.messageFeedback.findFirst({
            where: { messageId: { in: c.messages.map((m) => m.id) } },
            select: { id: true },
          })) !== null;

        if (c.messages.length >= 3 || hasFeedback) {
          qualifying.push({
            id: c.id,
            businessId: c.businessId,
            messages: c.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
          });
        } else {
          // Marked processed immediately (not left for the LLM) — a
          // 1-2 message exchange has no real back-and-forth to learn
          // from, but it must still be marked so it stops occupying
          // the front of the queue on every subsequent run. Same
          // atomic write as the main analysis path, for the same
          // reason (see recordAnalysisAndMarkProcessed's comment).
          await this.recordAnalysisAndMarkProcessed({
            conversationId: c.id,
            businessId: c.businessId,
            verdict: "dropped_irrelevant",
            findings: "Conversation too short (fewer than 3 messages) to analyze meaningfully — skipped without a reasoning LLM call.",
            examples: [],
          });
        }
      }
    }

    return qualifying.slice(0, limit);
  }

  /** Records the analysis AND marks the conversation processed in one
   * transaction — these must never happen as two separate awaited calls.
   * A real bug found live: with them separate, a failure anywhere after
   * recordAnalysis succeeded (even something as unrelated as a JSONL
   * file write) left the ChatAnalysis row created but the conversation
   * still flagged unprocessed — permanently stuck, since every future
   * run would re-select it, call the reasoning LLM again, and then
   * crash on ChatAnalysis's conversationId unique constraint. Either
   * both writes land or neither does. */
  async recordAnalysisAndMarkProcessed(params: {
    conversationId: string;
    businessId: string;
    verdict: string;
    findings: string;
    examples: { instruction: string; input: string; output: string }[];
  }): Promise<ChatAnalysisRecord> {
    const created = await prisma.$transaction(async (tx) => {
      const analysis = await tx.chatAnalysis.create({
        data: {
          conversationId: params.conversationId,
          businessId: params.businessId,
          verdict: params.verdict,
          findings: params.findings,
          examples: {
            create: params.examples.map((e) => ({
              businessId: params.businessId,
              instruction: e.instruction,
              input: e.input,
              output: e.output,
            })),
          },
        },
      });

      await tx.conversation.update({
        where: { id: params.conversationId },
        data: { processedForTraining: true },
      });

      return analysis;
    });

    return {
      id: created.id,
      conversationId: created.conversationId,
      businessId: created.businessId,
      verdict: created.verdict,
      findings: created.findings,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async analyses(businessId?: string, limit = 100): Promise<ChatAnalysisRecord[]> {
    const rows = await prisma.chatAnalysis.findMany({
      where: businessId ? { businessId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      businessId: r.businessId,
      verdict: r.verdict,
      findings: r.findings,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** "kept" findings for a business since a given timestamp (or ever) —
   * what PromptSuggestionService feeds to the reasoning LLM's second
   * pass. */
  async keptFindingsSince(businessId: string, since: Date | null): Promise<string[]> {
    const rows = await prisma.chatAnalysis.findMany({
      where: {
        businessId,
        verdict: "kept",
        ...(since ? { createdAt: { gt: since } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { findings: true },
    });

    return rows.map((r) => r.findings);
  }

  async createSuggestion(params: {
    businessId: string;
    source?: string;
    kind: string;
    proposedSystemPrompt?: string | null;
    proposedAppendText?: string | null;
    reasoning: string;
    pipelineRunId?: string | null;
  }): Promise<PromptSuggestionRecord> {
    const created = await prisma.promptSuggestion.create({
      data: {
        businessId: params.businessId,
        source: params.source ?? "pipeline",
        kind: params.kind,
        proposedSystemPrompt: params.proposedSystemPrompt ?? null,
        proposedAppendText: params.proposedAppendText ?? null,
        reasoning: params.reasoning,
        pipelineRunId: params.pipelineRunId ?? null,
      },
    });

    return toSuggestion(created);
  }

  async pendingSuggestions(businessId?: string): Promise<PromptSuggestionRecord[]> {
    const rows = await prisma.promptSuggestion.findMany({
      where: { status: "pending", ...(businessId ? { businessId } : {}) },
      orderBy: { createdAt: "desc" },
    });

    return rows.map(toSuggestion);
  }

  async decidedSuggestions(businessId?: string, limit = 50): Promise<PromptSuggestionRecord[]> {
    const rows = await prisma.promptSuggestion.findMany({
      where: { status: { not: "pending" }, ...(businessId ? { businessId } : {}) },
      orderBy: { decidedAt: "desc" },
      take: limit,
    });

    return rows.map(toSuggestion);
  }

  async getSuggestion(id: string): Promise<PromptSuggestionRecord | null> {
    const row = await prisma.promptSuggestion.findUnique({ where: { id } });
    return row ? toSuggestion(row) : null;
  }

  async decideSuggestion(id: string, status: "accepted" | "declined"): Promise<void> {
    await prisma.promptSuggestion.update({
      where: { id },
      data: { status, decidedAt: new Date() },
    });
  }

  /** Marks a suggestion superseded (refined into a new pending one) rather
   * than deleting it — kept for the review panel's audit trail. */
  async supersedeSuggestion(id: string): Promise<void> {
    await prisma.promptSuggestion.update({
      where: { id },
      data: { status: "superseded", decidedAt: new Date() },
    });
  }

  /** Most recent suggestion (of any status) for a business — used to
   * only re-suggest once there's new signal since last time, not every
   * single cron run. */
  async lastSuggestionAt(businessId: string): Promise<Date | null> {
    const row = await prisma.promptSuggestion.findFirst({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    return row?.createdAt ?? null;
  }
}

type SuggestionRow = {
  id: string;
  businessId: string;
  source: string;
  kind: string;
  proposedSystemPrompt: string | null;
  proposedAppendText: string | null;
  reasoning: string;
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
};

function toSuggestion(row: SuggestionRow): PromptSuggestionRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    source: row.source,
    kind: row.kind,
    proposedSystemPrompt: row.proposedSystemPrompt,
    proposedAppendText: row.proposedAppendText,
    reasoning: row.reasoning,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}
