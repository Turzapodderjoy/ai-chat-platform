import { prisma } from "@ai-chat-platform/database";

import { calcTotals, type LineItemInput } from "./money";

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;

export interface QuoteItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Quote {
  id: string;
  businessId: string;
  contactId: string | null;
  dealId: string | null;
  title: string;
  status: string;
  currency: string;
  discount: number;
  tax: number;
  notes: string | null;
  expiresAt: string | null;
  items: QuoteItem[];
  subtotal: number;
  total: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuoteInput {
  businessId: string;
  contactId?: string;
  dealId?: string;
  title: string;
  items: LineItemInput[];
  discount?: number;
  tax?: number;
  notes?: string;
  expiresAt?: string;
}

function toQuote(row: {
  id: string;
  businessId: string;
  contactId: string | null;
  dealId: string | null;
  title: string;
  status: string;
  currency: string;
  discount: number;
  tax: number;
  notes: string | null;
  expiresAt: Date | null;
  items: { id: string; name: string; quantity: number; unitPrice: number }[];
  createdAt: Date;
  updatedAt: Date;
}): Quote {
  const { subtotal, total } = calcTotals(row.items, row.discount, row.tax);
  return {
    id: row.id,
    businessId: row.businessId,
    contactId: row.contactId,
    dealId: row.dealId,
    title: row.title,
    status: row.status,
    currency: row.currency,
    discount: row.discount,
    tax: row.tax,
    notes: row.notes,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    items: row.items,
    subtotal,
    total,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A sales proposal — accepting one (via updateStatus) is the trigger a
 * staff member uses to hand it to InvoiceService.generateFromQuote. */
export class QuoteService {
  async create(input: CreateQuoteInput): Promise<Quote> {
    const row = await prisma.quote.create({
      data: {
        businessId: input.businessId,
        contactId: input.contactId,
        dealId: input.dealId,
        title: input.title,
        discount: input.discount ?? 0,
        tax: input.tax ?? 0,
        notes: input.notes,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        items: { create: input.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })) },
      },
      include: { items: true },
    });
    return toQuote(row);
  }

  async listForBusiness(businessId?: string): Promise<Quote[]> {
    const rows = await prisma.quote.findMany({
      where: businessId ? { businessId } : {},
      include: { items: true },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toQuote);
  }

  async listForContact(contactId: string): Promise<Quote[]> {
    const rows = await prisma.quote.findMany({
      where: { contactId },
      include: { items: true },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toQuote);
  }

  async get(id: string): Promise<Quote | null> {
    const row = await prisma.quote.findUnique({ where: { id }, include: { items: true } });
    return row ? toQuote(row) : null;
  }

  async updateStatus(id: string, status: string): Promise<Quote> {
    const row = await prisma.quote.update({ where: { id }, data: { status }, include: { items: true } });
    return toQuote(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.quote.delete({ where: { id } });
  }
}
