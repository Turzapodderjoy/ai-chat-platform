import { prisma, logAudit, archiveDeleted, nextDocumentNumber, consumeStock, restoreStock, type LotAllocation } from "@ai-chat-platform/database";

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

/** Line items ready to store: an Inventory product's quantity is taken
 * out of stock lots (oldest first) and the line keeps the weighted unit
 * cost of exactly those lots plus which lots -- so a later restock at a
 * different cost never changes what this invoice cost. */
async function prepareItems(items: LineItemInput[]) {
  const out = [];
  for (const i of items) {
    const used = i.productId ? await consumeStock(i.productId, i.quantity) : null;
    out.push({
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      productId: i.productId,
      costPrice: used ? (used.unitCost ?? i.costPrice) : i.costPrice,
      lotAllocations: used && used.allocations.length > 0 ? (used.allocations as unknown as object) : undefined,
    });
  }
  return out;
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
    const preparedItems = await prepareItems(input.items);
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
        items: { create: preparedItems },
      },
      include: INCLUDE,
    });
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
    const existing = await prisma.invoiceItem.findMany({ where: { invoiceId: id }, select: { productId: true, quantity: true, lotAllocations: true } });
    if (invoice) {
      await archiveDeleted({ businessId: invoice.businessId, entityType: "invoice", entityId: id, label: invoice.invoiceNumber, data: invoice, deletedBy: actorUsername });
    }
    await prisma.invoice.delete({ where: { id } });
    for (const item of existing) {
      if (item.productId) await restoreStock(item.productId, item.lotAllocations as LotAllocation[] | null, item.quantity);
    }
    if (invoice) {
      await logAudit({ businessId: invoice.businessId, entityType: "invoice", entityId: id, action: "deleted", detail: invoice.invoiceNumber, actorUsername });
    }
  }

  /** The customer paid less than the invoice total (say $40 of $50): turn
   * the shortfall into a recorded discount and close the invoice, instead
   * of hand-overriding the price. Total becomes what was actually paid,
   * the discount is kept as its own number (shown in the Invoices table,
   * on the print page and in the emailed PDF), and the invoice is paid. */
  async finalizeWithDiscount(id: string, actorUsername: string): Promise<Invoice> {
    const row = await prisma.invoice.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new Error("Invoice not found.");
    const view = toInvoice(row);
    if (view.amountPaid <= 0) throw new Error("Record the amount the customer actually paid first, then finalize.");
    const gap = view.balanceDue;
    if (gap <= 0) throw new Error("Nothing to discount -- this invoice is already fully paid.");

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        discount: row.discount + gap,
        // An override REPLACES the computed total, so the shortfall has to
        // come off it too or the discount would be recorded but ignored.
        ...(row.totalOverride !== null ? { totalOverride: row.totalOverride - gap } : {}),
        status: "paid",
      },
      include: INCLUDE,
    });
    await logAudit({ businessId: row.businessId, entityType: "invoice", entityId: id, action: "finalized", detail: `discount ${gap}`, actorUsername });
    return toInvoice(updated);
  }

  async update(id: string, input: UpdateInvoiceInput, actorUsername: string): Promise<Invoice> {
    const data: Record<string, unknown> = {};
    if (input.contactId !== undefined) data.contactId = input.contactId;
    if (input.discount !== undefined) data.discount = input.discount;
    if (input.tax !== undefined) data.tax = input.tax;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;

    if (input.items) {
      // Delete existing items and create new ones -- put back whatever the
      // old items took from stock first, then take for the new set, so
      // editing a line item's quantity (or swapping which product it uses)
      // doesn't leak or double-count stock.
      const existing = await prisma.invoiceItem.findMany({ where: { invoiceId: id }, select: { productId: true, quantity: true, lotAllocations: true } });
      for (const old of existing) {
        if (old.productId) await restoreStock(old.productId, old.lotAllocations as LotAllocation[] | null, old.quantity);
      }
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
      data.items = { create: await prepareItems(input.items) };
    }

    const row = await prisma.invoice.update({ where: { id }, data, include: INCLUDE });
    await logAudit({ businessId: row.businessId, entityType: "invoice", entityId: id, action: "updated", detail: row.invoiceNumber, actorUsername });
    return toInvoice(row);
  }
}
