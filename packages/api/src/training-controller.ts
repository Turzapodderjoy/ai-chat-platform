import {
  ChatAnalysisService,
  ChatAnalysisPipeline,
  PromptSuggestionService,
} from "@ai-chat-platform/training-pipeline";
import { AiConfigService, PLATFORM_CONFIG_ID } from "@ai-chat-platform/ai-config";
import type { TenantService } from "@ai-chat-platform/tenant";
import type { ConversationService } from "@ai-chat-platform/conversation";

/**
 * Read/decide surface for the Training Review dashboard panel. Training
 * only ever happens through two explicit, human-driven paths — a Training
 * Arena session or a dumped chat + instructions — never an automatic scan
 * of the whole conversation database. This controller reads what's been
 * produced, lets an admin accept/decline/refine a pending suggestion (the
 * "force run" step that actually hardcodes the change into the AI Brain
 * prompt), and lists Training Arena sessions for the Intercom-style sidebar.
 */
export class TrainingController {
  constructor(
    private readonly analysis: ChatAnalysisService,
    private readonly aiConfig: AiConfigService,
    private readonly pipeline: ChatAnalysisPipeline,
    private readonly suggestions: PromptSuggestionService,
    private readonly tenants: TenantService,
    private readonly conversations: ConversationService
  ) {}

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

    const note = `${suggestion.source === "dumped_chat" ? "Dumped chat" : "Training Arena"}: ${suggestion.reasoning.slice(0, 150)}`;

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
   * specific conversation on demand and, if the reasoning LLM found real
   * signal, immediately generates a proposed AI Brain change from it. The
   * returned suggestion (if any) is a normal pending PromptSuggestion —
   * Accept/Decline/Refine reuse the exact same methods below. */
  async reviewTrainingSession(sessionId: string): Promise<{
    verdict: string;
    findings: string;
    suggestion: { id: string; proposedAppendText: string; reasoning: string } | null;
  }> {
    const { businessId, verdict, findings } = await this.pipeline.analyzeConversationById(sessionId);

    if (verdict !== "kept") {
      return { verdict, findings, suggestion: null };
    }

    const suggestion = await this.suggestions.suggestFromFindings(businessId, [findings], "training_arena");

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
    const sourceLabel = suggestion.source === "dumped_chat" ? "Dumped chat" : "Training Arena";
    const note = `${sourceLabel} (broadcast to all clients): ${suggestion.reasoning.slice(0, 150)}`;

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
