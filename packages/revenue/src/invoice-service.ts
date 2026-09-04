import { prisma } from "@ai-chat-platform/database";

import { calcTotals, type LineItemInput } from "./money";

export const INVOICE_STATUSES = ["draft", "issued", "partially_paid", "paid", "overdue", "void"] as const;

export interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
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
  issueDate: Date;
  dueDate: Date | null;
  items: { id: string; name: string; quantity: number; unitPrice: number }[];
  payments: { id: string; amount: number; method: string; note: string | null; paidAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
};

function toInvoice(row: InvoiceRow): Invoice {
  const { subtotal, total } = calcTotals(row.items, row.discount, row.tax);
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
    const row = await prisma.invoice.create({
      data: {
        businessId: input.businessId,
        contactId: input.contactId,
        repairAppointmentId: input.repairAppointmentId,
        invoiceNumber,
        status: "issued",
        discount: input.discount ?? 0,
        tax: input.tax ?? 0,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        items: { create: input.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })) },
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
}
