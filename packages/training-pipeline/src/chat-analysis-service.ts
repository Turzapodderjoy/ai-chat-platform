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
    source: string;
    kind: string;
    proposedSystemPrompt?: string | null;
    proposedAppendText?: string | null;
    reasoning: string;
  }): Promise<PromptSuggestionRecord> {
    const created = await prisma.promptSuggestion.create({
      data: {
        businessId: params.businessId,
        source: params.source,
        kind: params.kind,
        proposedSystemPrompt: params.proposedSystemPrompt ?? null,
        proposedAppendText: params.proposedAppendText ?? null,
        reasoning: params.reasoning,
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
