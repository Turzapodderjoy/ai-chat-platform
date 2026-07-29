import {
  ChatAnalysisService,
  ChatAnalysisPipeline,
  PromptSuggestionService,
  PipelineRunService,
} from "@ai-chat-platform/training-pipeline";
import { AiConfigService, PLATFORM_CONFIG_ID } from "@ai-chat-platform/ai-config";
import type { TenantService } from "@ai-chat-platform/tenant";
import type { ConversationService } from "@ai-chat-platform/conversation";

/**
 * Read/decide surface for the Training Review dashboard panel — the
 * actual analysis/suggestion GENERATION happens in the daily cron
 * (chat-analysis-pipeline.ts / prompt-suggestion-service.ts) or on-demand
 * from the Training Arena, not here. This controller reads what's already
 * been produced, lets an admin accept/decline/refine a pending suggestion,
 * and lists Training Arena sessions for the Intercom-style sidebar.
 */
export class TrainingController {
  constructor(
    private readonly analysis: ChatAnalysisService,
    private readonly aiConfig: AiConfigService,
    private readonly pipeline: ChatAnalysisPipeline,
    private readonly suggestions: PromptSuggestionService,
    private readonly runs_: PipelineRunService,
    private readonly tenants: TenantService,
    private readonly conversations: ConversationService
  ) {}

  /** The daily 5am BST cron's entry point (triggeredBy "cron") — also
   * called directly by the dashboard's manual "Run now" button
   * (triggeredBy "manual"). Records a PipelineRun row wrapping the whole
   * thing so the Training & Insights panel's run-history table has a
   * permanent "did it run, and what happened" record, and tags every
   * suggestion created this pass with the run that produced it. */
  async runPipeline(triggeredBy: "cron" | "manual" = "cron") {
    const runId = await this.runs_.start(triggeredBy);

    const analysisResult = await this.pipeline.run();
    const suggestionResult = await this.suggestions.run(runId);

    await this.runs_.finish(runId, {
      conversationsProcessed: analysisResult.processed,
      kept: analysisResult.kept,
      dropped: analysisResult.dropped,
      failed: analysisResult.failed,
      businessesChecked: suggestionResult.businessesChecked,
      suggestionsCreated: suggestionResult.suggestionsCreated,
    });

    return { analysis: analysisResult, suggestions: suggestionResult };
  }

  runs(limit?: number) {
    return this.runs_.list(limit);
  }

  analyses(businessId?: string) {
    return this.analysis.analyses(businessId);
  }

  pendingSuggestions(businessId?: string) {
    return this.analysis.pendingSuggestions(businessId);
  }

  decidedSuggestions(businessId?: string) {
    return this.analysis.decidedSuggestions(businessId);
  }

  /** Training Arena's "Dump a chat" mode — interprets a pasted transcript
   * of an already-completed chat plus free-text instructions, proposing
   * an AI Brain change the same way a live arena session would. */
  submitDump(businessId: string, transcript: string, instructions: string) {
    if (!transcript.trim()) {
      throw new Error("Transcript is required.");
    }
    if (!instructions.trim()) {
      throw new Error("Instructions are required.");
    }

    return this.suggestions.submitDump(businessId, transcript, instructions);
  }

  /** Reviewer wants a pending suggestion adjusted rather than accepted or
   * declined outright — marks the original superseded and returns a new
   * pending suggestion in its place. */
  refineSuggestion(id: string, additionalFeedback: string) {
    if (!additionalFeedback.trim()) {
      throw new Error("Feedback is required.");
    }

    return this.suggestions.refineSuggestion(id, additionalFeedback);
  }

  /** Past Training Arena sessions for this business (or the platform-wide
   * arena) — the Intercom-style sidebar's list. */
  listTrainingSessions(businessId: string) {
    return this.conversations.listTrainingSessions(businessId);
  }

  /** Accepting writes a real new AiConfigVersion through the same
   * service the AI Brain panel's own Update/Add buttons use — an
   * accepted suggestion is indistinguishable from a manual edit in that
   * business's prompt history, by design. */
  async acceptSuggestion(id: string): Promise<{ accepted: string }> {
    const suggestion = await this.analysis.getSuggestion(id);

    if (!suggestion) {
      throw new Error(`Suggestion ${id} not found.`);
    }

    if (suggestion.status !== "pending") {
      throw new Error(`Suggestion ${id} has already been ${suggestion.status}.`);
    }

    const note = `Auto-suggested by training pipeline: ${suggestion.reasoning.slice(0, 150)}`;

    if (suggestion.kind === "append") {
      if (!suggestion.proposedAppendText) {
        throw new Error("Suggestion is missing its proposed append text.");
      }
      await this.aiConfig.append(suggestion.businessId, suggestion.proposedAppendText, note);
    } else {
      if (!suggestion.proposedSystemPrompt) {
        throw new Error("Suggestion is missing its proposed system prompt.");
      }
      const current = await this.aiConfig.getCurrent(suggestion.businessId);
      await this.aiConfig.update(
        suggestion.businessId,
        suggestion.proposedSystemPrompt,
        current.handoffFloor,
        current.historyTurns,
        current.temperature,
        note
      );
    }

    await this.analysis.decideSuggestion(id, "accepted");

    return { accepted: id };
  }

  /** Training Arena's "End session & review" button — analyzes one
   * specific conversation on demand (not the batch/unprocessed-queue
   * path) and, if the reasoning LLM found real signal, immediately
   * generates a proposed AI Brain change from it, skipping the daily
   * batch's "wait for 5 findings" threshold since a single deliberately-
   * provoked session is itself the whole point. The returned suggestion
   * (if any) is a normal pending PromptSuggestion — Save/Discard reuse
   * the exact same acceptSuggestion()/declineSuggestion() above. */
  async reviewTrainingSession(sessionId: string): Promise<{
    verdict: string;
    findings: string;
    suggestion: { id: string; proposedAppendText: string; reasoning: string } | null;
  }> {
    const { businessId, verdict, findings } = await this.pipeline.analyzeConversationById(sessionId);

    if (verdict !== "kept") {
      return { verdict, findings, suggestion: null };
    }

    const suggestion = await this.suggestions.suggestFromFindings(businessId, [findings], undefined, "training_arena");

    return { verdict, findings, suggestion };
  }

  /** Mother dashboard's Training Arena (general/platform-wide training,
   * as opposed to a client dashboard's Training Arena which only ever
   * touches that one business) — same reasoning as
   * AiConfigController.broadcastAppend(): applies the fix to the
   * platform default AND every existing client's own current prompt in
   * one go, since a general-behavior correction (tone, handoff wording,
   * format rules) should apply everywhere immediately, not just to
   * clients who haven't customized their prompt yet. Same underlying
   * write (AiConfigService.append(), one new AiConfigVersion per
   * business) as a manual edit or a normal single-business accept. */
  async acceptAndBroadcastSuggestion(id: string): Promise<{ accepted: string; businessIds: string[] }> {
    const suggestion = await this.analysis.getSuggestion(id);

    if (!suggestion) {
      throw new Error(`Suggestion ${id} not found.`);
    }

    if (suggestion.status !== "pending") {
      throw new Error(`Suggestion ${id} has already been ${suggestion.status}.`);
    }

    if (!suggestion.proposedAppendText) {
      throw new Error("Suggestion is missing its proposed append text.");
    }

    const businesses = await this.tenants.listAll();
    const targets = [PLATFORM_CONFIG_ID, ...businesses.map((b) => b.id)];
    const note = `Training Arena (broadcast to all clients): ${suggestion.reasoning.slice(0, 150)}`;

    for (const businessId of targets) {
      await this.aiConfig.append(businessId, suggestion.proposedAppendText, note);
    }

    await this.analysis.decideSuggestion(id, "accepted");

    return { accepted: id, businessIds: targets };
  }

  async declineSuggestion(id: string): Promise<{ declined: string }> {
    const suggestion = await this.analysis.getSuggestion(id);

    if (!suggestion) {
      throw new Error(`Suggestion ${id} not found.`);
    }

    if (suggestion.status !== "pending") {
      throw new Error(`Suggestion ${id} has already been ${suggestion.status}.`);
    }

    await this.analysis.decideSuggestion(id, "declined");

    return { declined: id };
  }
}
