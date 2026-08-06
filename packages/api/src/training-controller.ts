import {
  ConversationReviewService,
  TrainingAnalysisService,
} from "@ai-chat-platform/training-pipeline";
import type { ConversationService } from "@ai-chat-platform/conversation";

/** A pasted transcript line looks like "role: content" — anything not
 * matching a recognized role prefix is treated as a continuation of the
 * previous line (multi-line message), same convention the Training
 * Arena "Dump a chat" textarea's placeholder documents. */
const ROLE_PREFIX = /^(user|assistant|agent|system)\s*:\s*(.*)$/i;

function parseTranscript(transcript: string): { role: string; content: string }[] {
  const lines = transcript.split("\n");
  const messages: { role: string; content: string }[] = [];

  for (const line of lines) {
    const match = line.match(ROLE_PREFIX);
    if (match) {
      messages.push({ role: match[1]!.toLowerCase(), content: match[2]!.trim() });
    } else if (messages.length > 0 && line.trim()) {
      messages[messages.length - 1]!.content += `\n${line.trim()}`;
    }
  }

  return messages;
}

/**
 * Fully manual "Chat Learning" workflow: a human browses real chats
 * (customer conversations + Training Arena sessions) and decides which
 * are worth training on (add/drop) plus leaves pass/fail + notes — no
 * LLM makes any of those calls anymore. Once a batch is curated, one
 * explicit action sends it to Gemini for a single findings report; the
 * human reads it and edits the AI Brain prompt themselves elsewhere.
 */
export class TrainingController {
  constructor(
    private readonly reviews: ConversationReviewService,
    private readonly analysisRuns: TrainingAnalysisService,
    private readonly conversations: ConversationService
  ) {}

  listReviews(businessId: string) {
    return this.reviews.listForBusiness(businessId);
  }

  setDecision(conversationId: string, decision: "add" | "drop" | null) {
    if (!conversationId.trim()) {
      throw new Error("conversationId is required.");
    }
    return this.reviews.setDecision(conversationId, decision);
  }

  setQa(conversationId: string, verdict: "pass" | "fail" | null, note: string | null) {
    if (!conversationId.trim()) {
      throw new Error("conversationId is required.");
    }
    return this.reviews.setQa(conversationId, verdict, note ?? null);
  }

  runAnalysis(businessId: string, conversationIds: string[]) {
    return this.analysisRuns.runBatch(businessId, conversationIds);
  }

  listAnalysisRuns(businessId: string) {
    return this.analysisRuns.listRuns(businessId);
  }

  getAnalysisRun(id: string) {
    return this.analysisRuns.getRun(id);
  }

  /** Past Training Arena sessions for this business — the Intercom-style
   * sidebar's list. */
  listTrainingSessions(businessId: string) {
    return this.conversations.listTrainingSessions(businessId);
  }

  /** Training Arena's "Dump a chat" mode — parses a pasted transcript
   * into a real Conversation + Message rows (isTraining: true) so it
   * lands in the same Chat Learning list as any other chat, instead of
   * generating a suggestion directly. The reviewer's free-text
   * instructions become that conversation's initial QA note. */
  async submitDump(businessId: string, transcript: string, instructions: string): Promise<{ conversationId: string }> {
    if (!transcript.trim()) {
      throw new Error("Transcript is required.");
    }

    const messages = parseTranscript(transcript);
    if (messages.length === 0) {
      throw new Error('No messages found — use "role: content" per line, e.g. "user: ...".');
    }

    const conversationId = `dump-${crypto.randomUUID()}`;
    await this.conversations.getOrCreate(conversationId, businessId, "dump", true, "dump", null);

    for (const m of messages) {
      await this.conversations.addMessage(conversationId, m.role as "system" | "user" | "assistant" | "agent", m.content);
    }

    if (instructions.trim()) {
      await this.reviews.setQa(conversationId, null, instructions.trim());
    }

    return { conversationId };
  }
}
