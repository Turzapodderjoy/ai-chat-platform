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

interface RawSuggestionResponse {
  shouldChange?: boolean;
  reasoning?: string;
  proposedAppendText?: string;
}

export class PromptSuggestionService {
  constructor(
    private readonly analysis: ChatAnalysisService,
    private readonly reasoning: ReasoningClient,
    private readonly aiConfig: AiConfigService
  ) {}

  /** Training Arena's "End session & review" button — a single
   * deliberately-provoked (or reviewed) session is itself the whole
   * point, not a rolling batch. Returns the created suggestion (or null
   * if the model decided no change is warranted) so the caller can show
   * it for review/save/discard immediately. */
  async suggestFromFindings(
    businessId: string,
    findings: string[],
    source: string
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
