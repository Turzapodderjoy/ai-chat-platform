import { MessageFeedbackService } from "@ai-chat-platform/conversation";

/** Per-message QA pass/fail + feedback note from the Chat Demo tab —
 * used only for internal testing/QA, not exposed to real customers. */
export class FeedbackController {
  constructor(private readonly feedback: MessageFeedbackService) {}

  submit(messageId: string, businessId: string, verdict: string, note?: string) {
    if (!messageId.trim()) {
      throw new Error("messageId is required.");
    }

    if (verdict !== "pass" && verdict !== "fail") {
      throw new Error('verdict must be "pass" or "fail".');
    }

    return this.feedback.record(messageId, businessId, verdict, note);
  }

  /** Every QA'd message plus training-pipeline status — backs the QA
   * Review dashboard panel (mother-dashboard, spans every client). */
  list(businessId?: string) {
    return this.feedback.listWithStatus(businessId);
  }
}
