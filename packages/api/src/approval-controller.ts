import { ApprovalService, type StepInput } from "@ai-chat-platform/approvals";

/** Thin pass-through to the generic Approval Engine (Day 1 PM) -- no
 * module calls into this yet (CPQ/Procurement/Finance will later), so
 * this controller exists purely so the engine is independently
 * testable via a real HTTP surface before anything is built on top of
 * it. */
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  request(businessId: string, type: string, recordId: string, requestedBy: string, steps: StepInput[]) {
    return this.approvals.request({ businessId, type, recordId, requestedBy, steps });
  }

  get(id: string) {
    return this.approvals.get(id);
  }

  pendingFor(businessId: string, accountId: string, isAdmin: boolean) {
    return this.approvals.pendingFor(businessId, accountId, isAdmin);
  }

  decide(stepId: string, decision: "approved" | "rejected", decidedBy: string, comment?: string) {
    return this.approvals.decide(stepId, decision, decidedBy, comment);
  }
}
