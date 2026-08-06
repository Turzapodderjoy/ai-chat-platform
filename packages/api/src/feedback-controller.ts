import { MessageFeedbackService } from "@ai-chat-platform/conversation";

/** Per-message QA pass/fail + feedback note, written from Chat Learning's
 * per-message controls — internal QA only, never exposed to customers. */
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

  /** Every QA'd message for a business — used by Chat Learning to show
   * per-message pass/fail state inline while browsing a conversation. */
  list(businessId?: string) {
    return this.feedback.listWithStatus(businessId);
  }
}
