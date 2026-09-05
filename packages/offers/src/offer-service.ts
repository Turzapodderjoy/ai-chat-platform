import { prisma } from "@ai-chat-platform/database";

export interface CreateOfferInput {
  businessId: string;
  title: string;
  description?: string;
  discountType: string;
  discountValue: number;
  promoCode?: string;
  validFrom?: Date;
  validUntil?: Date;
  maxUses?: number;
}

export interface Offer {
  id: string;
  businessId: string;
  title: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  promoCode: string | null;
  validFrom: Date;
  validUntil: Date | null;
  isActive: boolean;
  maxUses: number | null;
  currentUses: number;
  createdAt: Date;
  updatedAt: Date;
}

function toOffer(row: any): Offer {
  return {
    id: row.id,
    businessId: row.businessId,
    title: row.title,
    description: row.description ?? null,
    discountType: row.discountType,
    discountValue: row.discountValue,
    promoCode: row.promoCode ?? null,
    validFrom: row.validFrom,
    validUntil: row.validUntil ?? null,
    isActive: row.isActive,
    maxUses: row.maxUses ?? null,
    currentUses: row.currentUses,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class OfferService {
  async listForBusiness(businessId: string): Promise<Offer[]> {
    const rows = await prisma.offer.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toOffer);
  }

  async create(input: CreateOfferInput): Promise<Offer> {
    const row = await prisma.offer.create({
      data: {
        businessId: input.businessId,
        title: input.title,
        description: input.description ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        promoCode: input.promoCode?.toUpperCase() ?? null,
        validFrom: input.validFrom ?? new Date(),
        validUntil: input.validUntil ?? null,
        maxUses: input.maxUses ?? null,
      },
    });
    return toOffer(row);
  }

  async update(id: string, data: Partial<Pick<CreateOfferInput, "title" | "description" | "discountType" | "discountValue" | "promoCode" | "validUntil" | "maxUses">> & { isActive?: boolean }): Promise<Offer> {
    const row = await prisma.offer.update({
      where: { id },
      data: {
        ...data,
        promoCode: data.promoCode?.toUpperCase() ?? undefined,
      },
    });
    return toOffer(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.offer.delete({ where: { id } });
  }

  async validate(businessId: string, code: string): Promise<{ valid: boolean; offer?: Offer; error?: string }> {
    const row = await prisma.offer.findFirst({
      where: {
        businessId,
        promoCode: code.toUpperCase(),
        isActive: true,
      },
    });

    if (!row) {
      return { valid: false, error: "Invalid promo code" };
    }

    if (row.validUntil && row.validUntil < new Date()) {
      return { valid: false, error: "This offer has expired" };
    }

    if (row.maxUses && row.currentUses >= row.maxUses) {
      return { valid: false, error: "This offer has reached its usage limit" };
    }

    return { valid: true, offer: toOffer(row) };
  }

  async incrementUses(id: string): Promise<void> {
    await prisma.offer.update({
      where: { id },
      data: { currentUses: { increment: 1 } },
    });
  }
}
