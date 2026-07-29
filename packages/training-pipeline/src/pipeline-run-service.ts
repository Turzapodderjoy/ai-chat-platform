import { prisma } from "@ai-chat-platform/database";

export interface PipelineRunRecord {
  id: string;
  triggeredBy: "cron" | "manual";
  startedAt: string;
  finishedAt: string | null;
  conversationsProcessed: number;
  kept: number;
  dropped: number;
  failed: number;
  businessesChecked: number;
  suggestionsCreated: number;
}

export interface PipelineRunWithSuggestions extends PipelineRunRecord {
  suggestions: Array<{
    id: string;
    businessId: string;
    kind: string;
    proposedAppendText: string | null;
    proposedSystemPrompt: string | null;
    reasoning: string;
    status: string;
  }>;
}

/** One row per invocation of the training pipeline (cron or manual) —
 * the "did it run, and what happened" record backing the Training &
 * Insights panel's run-history table. */
export class PipelineRunService {
  async start(triggeredBy: "cron" | "manual"): Promise<string> {
    const row = await prisma.pipelineRun.create({ data: { triggeredBy } });
    return row.id;
  }

  async finish(
    id: string,
    result: {
      conversationsProcessed: number;
      kept: number;
      dropped: number;
      failed: number;
      businessesChecked: number;
      suggestionsCreated: number;
    }
  ): Promise<void> {
    await prisma.pipelineRun.update({
      where: { id },
      data: { ...result, finishedAt: new Date() },
    });
  }

  async list(limit = 30): Promise<PipelineRunWithSuggestions[]> {
    const rows = await prisma.pipelineRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
      include: { suggestions: true },
    });

    return rows.map((row) => ({
      id: row.id,
      triggeredBy: row.triggeredBy as "cron" | "manual",
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      conversationsProcessed: row.conversationsProcessed,
      kept: row.kept,
      dropped: row.dropped,
      failed: row.failed,
      businessesChecked: row.businessesChecked,
      suggestionsCreated: row.suggestionsCreated,
      suggestions: row.suggestions.map((s) => ({
        id: s.id,
        businessId: s.businessId,
        kind: s.kind,
        proposedAppendText: s.proposedAppendText,
        proposedSystemPrompt: s.proposedSystemPrompt,
        reasoning: s.reasoning,
        status: s.status,
      })),
    }));
  }
}
