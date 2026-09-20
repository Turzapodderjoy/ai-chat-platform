import { prisma, logAudit, archiveDeleted, nextDocumentNumber } from "@ai-chat-platform/database";

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

/** delta is negative to consume stock, positive to restore it. Silently
 * no-ops when stock isn't a plain parseable number -- Product.stock is
 * free text by design (see Product's own schema comment), and this
 * shouldn't corrupt a value like "12 (backordered)". Same convention as
 * RepairAppointmentService's own adjustProductStock -- kept as a
 * separate copy here rather than a shared package for ~10 lines, and
 * because the two callers' item shapes (RepairOrderItem vs
 * InvoiceItem) are different enough that a shared signature would just
 * add an adapter layer. */
async function adjustProductStock(productId: string, delta: number): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { stock: true } });
  if (!product?.stock) return;
  const current = Number(product.stock);
  if (!Number.isFinite(current)) return;
  await prisma.product.update({ where: { id: productId }, data: { stock: String(current + delta) } });
}

export class InvoiceService {
  /** An invoice generated from an appointment carries THAT appointment's
   * number (the appointment #, order # and invoice # are one value); a
   * hand-made invoice with no appointment behind it draws its own from
   * the same shared sequence, so the two can never collide. */
  private async invoiceNumberFor(businessId: string, repairAppointmentId?: string): Promise<string> {
    if (repairAppointmentId) {
      const appt = await prisma.repairAppointment.findUnique({ where: { id: repairAppointmentId }, select: { serialNumber: true } });
      const existing = await prisma.invoice.findFirst({ where: { repairAppointmentId }, select: { invoiceNumber: true } });
      if (existing) {
        throw new Error(`This order already has an invoice (#${existing.invoiceNumber}) -- edit or delete that one instead.`);
      }
      let serial = appt?.serialNumber;
      if (!serial) {
        // Legacy appointment from before every booking was numbered.
        serial = await nextDocumentNumber(businessId);
        await prisma.repairAppointment.update({ where: { id: repairAppointmentId }, data: { serialNumber: serial } });
      }
      return serial;
    }
    return nextDocumentNumber(businessId);
  }

  async create(input: CreateInvoiceInput, actorUsername: string): Promise<Invoice> {
    const invoiceNumber = await this.invoiceNumberFor(input.businessId, input.repairAppointmentId);
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
    for (const item of input.items) {
      if (item.productId) await adjustProductStock(item.productId, -item.quantity);
    }
    await logAudit({ businessId: input.businessId, entityType: "invoice", entityId: row.id, action: "generated", detail: row.invoiceNumber, actorUsername });
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

  async updateStatus(id: string, status: string, actorUsername: string): Promise<Invoice> {
    const row = await prisma.invoice.update({ where: { id }, data: { status }, include: INCLUDE });
    await logAudit({ businessId: row.businessId, entityType: "invoice", entityId: id, action: "status_changed", detail: status, actorUsername });
    return toInvoice(row);
  }

  async delete(id: string, actorUsername: string): Promise<void> {
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: INCLUDE });
    const existing = await prisma.invoiceItem.findMany({ where: { invoiceId: id }, select: { productId: true, quantity: true } });
    if (invoice) {
      await archiveDeleted({ businessId: invoice.businessId, entityType: "invoice", entityId: id, label: invoice.invoiceNumber, data: invoice, deletedBy: actorUsername });
    }
    await prisma.invoice.delete({ where: { id } });
    for (const item of existing) {
      if (item.productId) await adjustProductStock(item.productId, item.quantity);
    }
    if (invoice) {
      await logAudit({ businessId: invoice.businessId, entityType: "invoice", entityId: id, action: "deleted", detail: invoice.invoiceNumber, actorUsername });
    }
  }

  async update(id: string, input: UpdateInvoiceInput, actorUsername: string): Promise<Invoice> {
    const data: Record<string, unknown> = {};
    if (input.contactId !== undefined) data.contactId = input.contactId;
    if (input.discount !== undefined) data.discount = input.discount;
    if (input.tax !== undefined) data.tax = input.tax;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;

    let restoreStock: { productId: string; quantity: number }[] = [];
    if (input.items) {
      // Delete existing items and create new ones -- restore stock for
      // whatever the old items consumed first, then decrement for the
      // new set below, so editing a line item's quantity (or swapping
      // which product it uses) doesn't leak or double-count stock.
      const existing = await prisma.invoiceItem.findMany({ where: { invoiceId: id }, select: { productId: true, quantity: true } });
      restoreStock = existing.filter((i): i is { productId: string; quantity: number } => !!i.productId);
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
      data.items = { create: input.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, productId: i.productId, costPrice: i.costPrice })) };
    }

    const row = await prisma.invoice.update({ where: { id }, data, include: INCLUDE });
    for (const item of restoreStock) await adjustProductStock(item.productId, item.quantity);
    if (input.items) {
      for (const item of input.items) {
        if (item.productId) await adjustProductStock(item.productId, -item.quantity);
      }
    }
    await logAudit({ businessId: row.businessId, entityType: "invoice", entityId: id, action: "updated", detail: row.invoiceNumber, actorUsername });
    return toInvoice(row);
  }
}
