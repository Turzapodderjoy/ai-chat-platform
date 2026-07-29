import { ChatAnalysisService } from "./chat-analysis-service";
import { ReasoningClient } from "./reasoning-client";
import {
  PROMPT_SUGGESTION_SYSTEM_PROMPT,
  buildPromptSuggestionUserPrompt,
  DUMPED_CHAT_SYSTEM_PROMPT,
  buildDumpedChatUserPrompt,
  REFINE_SUGGESTION_SYSTEM_PROMPT,
  buildRefineSuggestionUserPrompt,
} from "./system-prompt";
import type { AiConfigService } from "@ai-chat-platform/ai-config";
import type { TenantService } from "@ai-chat-platform/tenant";

interface RawSuggestionResponse {
  shouldChange?: boolean;
  reasoning?: string;
  proposedAppendText?: string;
}

/** Only worth spending a reasoning-LLM call on a business once it has
 * this many NEW "kept" findings since its last suggestion (or ever) —
 * otherwise every business would get a suggestion-generation call every
 * single day even with nothing new to say, burning the pipeline's
 * shared rate-limit budget on empty results. */
const MIN_NEW_FINDINGS = 5;

export class PromptSuggestionService {
  constructor(
    private readonly analysis: ChatAnalysisService,
    private readonly reasoning: ReasoningClient,
    private readonly aiConfig: AiConfigService,
    private readonly tenants: TenantService
  ) {}

  /** Runs the suggestion pass across every client business — the
   * platform-wide ("__platform__") prompt is deliberately excluded,
   * since it's the mother dashboard's shared default, not any one
   * client's real usage pattern. `pipelineRunId` (if given) tags every
   * suggestion created this pass with the PipelineRun that produced it,
   * for the Training & Insights panel's run-history table. */
  async run(pipelineRunId?: string): Promise<{ businessesChecked: number; suggestionsCreated: number }> {
    const businesses = await this.tenants.listAll();

    let suggestionsCreated = 0;

    for (const business of businesses) {
      const created = await this.checkOne(business.id, pipelineRunId);
      if (created) {
        suggestionsCreated += 1;
      }
    }

    return { businessesChecked: businesses.length, suggestionsCreated };
  }

  private async checkOne(businessId: string, pipelineRunId?: string): Promise<boolean> {
    const lastSuggestionAt = await this.analysis.lastSuggestionAt(businessId);
    const findings = await this.analysis.keptFindingsSince(businessId, lastSuggestionAt);

    if (findings.length < MIN_NEW_FINDINGS) {
      return false;
    }

    try {
      const suggestion = await this.suggestFromFindings(businessId, findings, pipelineRunId);
      return suggestion !== null;
    } catch (error) {
      // Reasoning LLM unavailable or returned something unparseable —
      // try again next run, don't crash the whole batch pass over it.
      console.error(`Prompt suggestion check failed for business ${businessId}:`, error);
      return false;
    }
  }

  /** Same reasoning-LLM call as checkOne(), but skips the "wait for
   * MIN_NEW_FINDINGS" threshold — for the Training Arena's "End session &
   * review" button, where a single deliberately-provoked session is
   * itself the whole point, not a rolling batch of incidental findings.
   * Returns the created suggestion (or null if the model decided no
   * change is warranted) so the caller can show it for review/save/
   * discard immediately instead of waiting to notice it in the pending
   * suggestions list. */
  async suggestFromFindings(
    businessId: string,
    findings: string[],
    pipelineRunId?: string,
    source: string = "pipeline"
  ): Promise<{ id: string; proposedAppendText: string; reasoning: string } | null> {
    const current = await this.aiConfig.getCurrent(businessId);
    const userPrompt = buildPromptSuggestionUserPrompt({
      currentSystemPrompt: current.systemPrompt,
      findingsBatch: findings,
    });

    const result = await this.reasoning.ask(PROMPT_SUGGESTION_SYSTEM_PROMPT, userPrompt);
    const parsed = parseJsonResponse<RawSuggestionResponse>(result.content);

    if (!parsed) {
      throw new Error(
        `Prompt suggestion for business ${businessId}: unparseable response. Raw: ${result.content.slice(0, 300)}`
      );
    }

    if (!parsed.shouldChange || !parsed.proposedAppendText) {
      return null;
    }

    const created = await this.analysis.createSuggestion({
      businessId,
      source,
      kind: "append",
      proposedSystemPrompt: null,
      proposedAppendText: parsed.proposedAppendText,
      reasoning: parsed.reasoning ?? "(no reasoning text returned)",
      pipelineRunId,
    });

    return {
      id: created.id,
      proposedAppendText: parsed.proposedAppendText,
      reasoning: parsed.reasoning ?? "(no reasoning text returned)",
    };
  }

  /** Interprets a pasted transcript of an already-completed chat plus
   * free-text instructions ("what to do / not do") and proposes an AI
   * Brain append — the Training Arena's "Dump a chat" mode, for
   * conversations that happened outside the live arena (e.g. exported
   * from a real channel) instead of live-provoked sessions. */
  async submitDump(
    businessId: string,
    transcript: string,
    instructions: string
  ): Promise<{ id: string; proposedAppendText: string; reasoning: string } | null> {
    const current = await this.aiConfig.getCurrent(businessId);
    const userPrompt = buildDumpedChatUserPrompt({
      currentSystemPrompt: current.systemPrompt,
      transcript,
      instructions,
    });

    const result = await this.reasoning.ask(DUMPED_CHAT_SYSTEM_PROMPT, userPrompt);
    const parsed = parseJsonResponse<RawSuggestionResponse>(result.content);

    if (!parsed) {
      throw new Error(
        `Dumped-chat suggestion for business ${businessId}: unparseable response. Raw: ${result.content.slice(0, 300)}`
      );
    }

    if (!parsed.shouldChange || !parsed.proposedAppendText) {
      return null;
    }

    const created = await this.analysis.createSuggestion({
      businessId,
      source: "dumped_chat",
      kind: "append",
      proposedSystemPrompt: null,
      proposedAppendText: parsed.proposedAppendText,
      reasoning: parsed.reasoning ?? "(no reasoning text returned)",
    });

    return {
      id: created.id,
      proposedAppendText: parsed.proposedAppendText,
      reasoning: parsed.reasoning ?? "(no reasoning text returned)",
    };
  }

  /** Revises a pending suggestion in light of additional human feedback —
   * marks the original superseded and creates a new pending suggestion in
   * its place, rather than mutating the original (keeps the audit trail:
   * what was proposed, what the reviewer said, what changed as a result). */
  async refineSuggestion(
    id: string,
    additionalFeedback: string
  ): Promise<{ id: string; proposedAppendText: string; reasoning: string }> {
    const original = await this.analysis.getSuggestion(id);
    if (!original) {
      throw new Error("Suggestion not found.");
    }
    if (original.status !== "pending") {
      throw new Error("Only a pending suggestion can be refined.");
    }

    const userPrompt = buildRefineSuggestionUserPrompt({
      proposedAppendText: original.proposedAppendText ?? "",
      reasoning: original.reasoning,
      additionalFeedback,
    });

    const result = await this.reasoning.ask(REFINE_SUGGESTION_SYSTEM_PROMPT, userPrompt);
    const parsed = parseJsonResponse<{ proposedAppendText?: string; reasoning?: string }>(result.content);

    if (!parsed || !parsed.proposedAppendText) {
      throw new Error(
        `Refine suggestion ${id}: unparseable response. Raw: ${result.content.slice(0, 300)}`
      );
    }

    await this.analysis.supersedeSuggestion(id);

    const created = await this.analysis.createSuggestion({
      businessId: original.businessId,
      source: original.source,
      kind: "append",
      proposedSystemPrompt: null,
      proposedAppendText: parsed.proposedAppendText,
      reasoning: parsed.reasoning ?? "(no reasoning text returned)",
    });

    return {
      id: created.id,
      proposedAppendText: parsed.proposedAppendText,
      reasoning: parsed.reasoning ?? "(no reasoning text returned)",
    };
  }
}

function parseJsonResponse<T>(raw: string): T | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
