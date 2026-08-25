import { prisma } from "@ai-chat-platform/database";

export const DEAL_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export interface Deal {
  id: string;
  businessId: string;
  contactId: string | null;
  title: string;
  amount: number | null;
  stage: string;
  status: string;
  closeDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDealInput {
  businessId: string;
  contactId?: string;
  title: string;
  amount?: number;
}

function toDeal(row: {
  id: string;
  businessId: string;
  contactId: string | null;
  title: string;
  amount: number | null;
  stage: string;
  status: string;
  closeDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Deal {
  return {
    id: row.id,
    businessId: row.businessId,
    contactId: row.contactId,
    title: row.title,
    amount: row.amount,
    stage: row.stage,
    status: row.status,
    closeDate: row.closeDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A sales opportunity — separate from Order (a completed transaction);
 * a Deal is the opportunity that may or may not become one. Stage
 * moves through DEAL_STAGES via updateStage; "won"/"lost" are both a
 * stage AND flip `status` to a matching terminal value so an open-deals
 * view can filter without string-matching stage names. */
export class DealService {
  async create(input: CreateDealInput): Promise<Deal> {
    const row = await prisma.deal.create({
      data: {
        businessId: input.businessId,
        contactId: input.contactId,
        title: input.title,
        amount: input.amount,
      },
    });
    return toDeal(row);
  }

  /** Auto-creates a Deal already at its closed-won stage — a real Order
   * being placed is itself proof a sale happened, there's no earlier
   * pipeline stage to walk it through first. Used by ChatService right
   * after an Order is saved, so Deals reflect what actually sold instead
   * of only ever being created by hand. */
  async createWon(input: CreateDealInput): Promise<Deal> {
    const row = await prisma.deal.create({
      data: {
        businessId: input.businessId,
        contactId: input.contactId,
        title: input.title,
        amount: input.amount,
        stage: "won",
        status: "won",
      },
    });
    return toDeal(row);
  }

  async listForBusiness(businessId?: string): Promise<Deal[]> {
    const rows = await prisma.deal.findMany({
      where: businessId ? { businessId } : {},
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toDeal);
  }

  async updateStage(id: string, stage: string): Promise<Deal> {
    const status = stage === "won" ? "won" : stage === "lost" ? "lost" : "open";
    const row = await prisma.deal.update({ where: { id }, data: { stage, status } });
    return toDeal(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.deal.delete({ where: { id } });
  }
}
