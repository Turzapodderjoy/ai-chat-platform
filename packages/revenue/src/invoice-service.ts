import { prisma } from "@ai-chat-platform/database";

import { calcTotals, type LineItemInput } from "./money";

export const INVOICE_STATUSES = ["draft", "issued", "partially_paid", "paid", "overdue", "void"] as const;

export interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  // Internal only -- costPrice never appears on the customer-facing
  // print/PDF view, only sell price (unitPrice) and totals do.
  productId?: string | null;
  costPrice?: number | null;
}

export interface InvoicePayment {
  id: string;
  amount: number;
  method: string;
  note: string | null;
  paidAt: string;
}

export interface Invoice {
  id: string;
  businessId: string;
  contactId: string | null;
  repairAppointmentId: string | null;
  invoiceNumber: string;
  status: string;
  currency: string;
  discount: number;
  tax: number;
  amountPaid: number;
  totalOverride: number | null;
  issueDate: string;
  dueDate: string | null;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  subtotal: number;
  total: number;
  balanceDue: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceInput {
  businessId: string;
  contactId?: string;
  repairAppointmentId?: string;
  items: LineItemInput[];
  discount?: number;
  tax?: number;
  dueDate?: string;
}

export interface UpdateInvoiceInput {
  contactId?: string | null;
  items?: LineItemInput[];
  discount?: number;
  tax?: number;
  dueDate?: string | null;
}

type InvoiceRow = {
  id: string;
  businessId: string;
  contactId: string | null;
  repairAppointmentId: string | null;
  invoiceNumber: string;
  status: string;
  currency: string;
  discount: number;
  tax: number;
  amountPaid: number;
  totalOverride: number | null;
  issueDate: Date;
  dueDate: Date | null;
  items: { id: string; name: string; quantity: number; unitPrice: number; productId: string | null; costPrice: number | null }[];
  payments: { id: string; amount: number; method: string; note: string | null; paidAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
};

function toInvoice(row: InvoiceRow): Invoice {
  const { subtotal, total: computedTotal } = calcTotals(row.items, row.discount, row.tax);
  const total = row.totalOverride ?? computedTotal;
  return {
    id: row.id,
    businessId: row.businessId,
    contactId: row.contactId,
    repairAppointmentId: row.repairAppointmentId,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    currency: row.currency,
    discount: row.discount,
    tax: row.tax,
    amountPaid: row.amountPaid,
    totalOverride: row.totalOverride,
    issueDate: row.issueDate.toISOString(),
    dueDate: row.dueDate?.toISOString() ?? null,
    items: row.items,
    payments: row.payments.map((p) => ({ id: p.id, amount: p.amount, method: p.method, note: p.note, paidAt: p.paidAt.toISOString() })),
    subtotal,
    total,
    balanceDue: Math.max(0, total - row.amountPaid),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const INCLUDE = { items: true, payments: true } as const;

export class InvoiceService {
  private async nextInvoiceNumber(businessId: string): Promise<string> {
    const count = await prisma.invoice.count({ where: { businessId } });
    return `INV-${String(count + 1).padStart(4, "0")}`;
  }

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    const invoiceNumber = await this.nextInvoiceNumber(input.businessId);
    const business = await prisma.business.findUnique({ where: { id: input.businessId }, select: { subscriptionCurrency: true } });
    const row = await prisma.invoice.create({
      data: {
        businessId: input.businessId,
        contactId: input.contactId,
        repairAppointmentId: input.repairAppointmentId,
        invoiceNumber,
        status: "issued",
        currency: business?.subscriptionCurrency ?? "USD",
        discount: input.discount ?? 0,
        tax: input.tax ?? 0,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        items: { create: input.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, productId: i.productId, costPrice: i.costPrice })) },
      },
      include: INCLUDE,
    });
    return toInvoice(row);
  }

  async listForBusiness(businessId?: string): Promise<Invoice[]> {
    const rows = await prisma.invoice.findMany({
      where: businessId ? { businessId } : {},
      include: INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toInvoice);
  }

  async listForContact(contactId: string): Promise<Invoice[]> {
    const rows = await prisma.invoice.findMany({
      where: { contactId },
      include: INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toInvoice);
  }

  async get(id: string): Promise<Invoice | null> {
    const row = await prisma.invoice.findUnique({ where: { id }, include: INCLUDE });
    return row ? toInvoice(row) : null;
  }

  async updateStatus(id: string, status: string): Promise<Invoice> {
    const row = await prisma.invoice.update({ where: { id }, data: { status }, include: INCLUDE });
    return toInvoice(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.invoice.delete({ where: { id } });
  }

  async update(id: string, input: UpdateInvoiceInput): Promise<Invoice> {
    const data: Record<string, unknown> = {};
    if (input.contactId !== undefined) data.contactId = input.contactId;
    if (input.discount !== undefined) data.discount = input.discount;
    if (input.tax !== undefined) data.tax = input.tax;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;

    if (input.items) {
      // Delete existing items and create new ones
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
      data.items = { create: input.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, productId: i.productId, costPrice: i.costPrice })) };
    }

    const row = await prisma.invoice.update({ where: { id }, data, include: INCLUDE });
    return toInvoice(row);
  }
}
