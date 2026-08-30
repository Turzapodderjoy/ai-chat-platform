import { prisma } from "@ai-chat-platform/database";

export interface StepInput {
  /** Every step in the same order runs in PARALLEL (all must approve
   * before that stage passes); a later order's steps aren't decidable
   * until every step in an earlier order is approved. Start at 0. */
  order: number;
  /** Exactly one of these -- a specific person, or anyone matching a
   * role (currently just "isAdmin", the only role this app's
   * ClientAccount model has to check against). */
  approverAccountId?: string;
  approverRole?: string;
}

export interface ApprovalRequestSummary {
  id: string;
  businessId: string;
  type: string;
  recordId: string;
  requestedBy: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  steps: ApprovalStepSummary[];
}

export interface ApprovalStepSummary {
  id: string;
  order: number;
  status: string;
  approverAccountId: string | null;
  approverRole: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  comment: string | null;
}

function toStepSummary(s: {
  id: string;
  order: number;
  status: string;
  approverAccountId: string | null;
  approverRole: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  comment: string | null;
}): ApprovalStepSummary {
  return {
    id: s.id,
    order: s.order,
    status: s.status,
    approverAccountId: s.approverAccountId,
    approverRole: s.approverRole,
    decidedBy: s.decidedBy,
    decidedAt: s.decidedAt?.toISOString() ?? null,
    comment: s.comment,
  };
}

/** Generic sequential/parallel approval workflow, built once (Day 1 PM)
 * so every later module that needs sign-off (CPQ, Procurement,
 * Finance) calls into this instead of inventing its own approve/reject
 * logic. This service deliberately knows nothing about WHAT is being
 * approved -- `type`/`recordId` are the caller's own pointer back to
 * their own record (a Quote id, a PurchaseOrder id, ...); callers are
 * responsible for checking a request's final status before acting on
 * whatever it gates. */
export class ApprovalService {
  async request(input: {
    businessId: string;
    type: string;
    recordId: string;
    requestedBy: string;
    steps: StepInput[];
  }): Promise<ApprovalRequestSummary> {
    if (input.steps.length === 0) {
      throw new Error("At least one approval step is required.");
    }
    for (const step of input.steps) {
      if (!step.approverAccountId && !step.approverRole) {
        throw new Error("Every approval step needs either approverAccountId or approverRole.");
      }
    }

    const row = await prisma.approvalRequest.create({
      data: {
        businessId: input.businessId,
        type: input.type,
        recordId: input.recordId,
        requestedBy: input.requestedBy,
        steps: {
          create: input.steps.map((s) => ({
            order: s.order,
            approverAccountId: s.approverAccountId ?? null,
            approverRole: s.approverRole ?? null,
          })),
        },
      },
      include: { steps: true },
    });

    return this.toSummary(row);
  }

  async get(id: string): Promise<ApprovalRequestSummary | null> {
    const row = await prisma.approvalRequest.findUnique({ where: { id }, include: { steps: true } });
    return row ? this.toSummary(row) : null;
  }

  /** Every request an account could act on right now -- a step whose
   * order is the lowest still-pending order for its request (earlier
   * stages must already be fully approved), and whose approver is
   * either this exact account or matches its role. */
  async pendingFor(businessId: string, accountId: string, isAdmin: boolean): Promise<ApprovalRequestSummary[]> {
    const requests = await prisma.approvalRequest.findMany({
      where: { businessId, status: "pending" },
      include: { steps: true },
      orderBy: { createdAt: "asc" },
    });

    return requests
      .filter((r) => {
        const nextOrder = this.nextDecidableOrder(r.steps);
        if (nextOrder === null) return false;
        return r.steps.some(
          (s) =>
            s.order === nextOrder &&
            s.status === "pending" &&
            (s.approverAccountId === accountId || (s.approverRole === "isAdmin" && isAdmin))
        );
      })
      .map((r) => this.toSummary(r));
  }

  /** The lowest order that still has a pending step AND every earlier
   * order is fully approved -- null once nothing is actionable (either
   * everything's decided, or an earlier stage is still pending). */
  private nextDecidableOrder(steps: { order: number; status: string }[]): number | null {
    const orders = [...new Set(steps.map((s) => s.order))].sort((a, b) => a - b);
    for (const order of orders) {
      const atThisOrder = steps.filter((s) => s.order === order);
      if (atThisOrder.some((s) => s.status === "pending")) return order;
      if (atThisOrder.some((s) => s.status === "rejected")) return null; // whole request already dead
    }
    return null;
  }

  /** Decides one step. Rejecting ANY step immediately rejects the whole
   * request (no partial rollback needed -- nothing downstream should
   * have acted on a request that was still pending). Approving a step
   * only advances the request to "approved" once every step in every
   * order has been approved. */
  async decide(stepId: string, decision: "approved" | "rejected", decidedBy: string, comment?: string): Promise<ApprovalRequestSummary> {
    const step = await prisma.approvalStep.findUnique({ where: { id: stepId }, include: { request: { include: { steps: true } } } });
    if (!step) throw new Error("Approval step not found.");
    if (step.status !== "pending") throw new Error("This step has already been decided.");

    const nextOrder = this.nextDecidableOrder(step.request.steps);
    if (nextOrder === null || step.order !== nextOrder) {
      throw new Error("An earlier approval stage hasn't been fully decided yet.");
    }

    await prisma.approvalStep.update({
      where: { id: stepId },
      data: { status: decision, decidedBy, decidedAt: new Date(), comment: comment ?? null },
    });

    const refreshed = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: step.requestId }, include: { steps: true } });

    if (decision === "rejected") {
      const updated = await prisma.approvalRequest.update({
        where: { id: step.requestId },
        data: { status: "rejected", decidedAt: new Date() },
        include: { steps: true },
      });
      return this.toSummary(updated);
    }

    const allApproved = refreshed.steps.every((s) => s.status === "approved");
    if (allApproved) {
      const updated = await prisma.approvalRequest.update({
        where: { id: step.requestId },
        data: { status: "approved", decidedAt: new Date() },
        include: { steps: true },
      });
      return this.toSummary(updated);
    }

    return this.toSummary(refreshed);
  }

  private toSummary(row: {
    id: string;
    businessId: string;
    type: string;
    recordId: string;
    requestedBy: string;
    status: string;
    createdAt: Date;
    decidedAt: Date | null;
    steps: Parameters<typeof toStepSummary>[0][];
  }): ApprovalRequestSummary {
    return {
      id: row.id,
      businessId: row.businessId,
      type: row.type,
      recordId: row.recordId,
      requestedBy: row.requestedBy,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      steps: row.steps.sort((a, b) => a.order - b.order).map(toStepSummary),
    };
  }
}
