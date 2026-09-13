import { prisma } from "@ai-chat-platform/database";

import { calcTotals } from "./money";

export interface Payment {
  id: string;
  businessId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  method: string;
  note: string | null;
  paidAt: string;
  createdAt: string;
}

export interface RecordPaymentInput {
  businessId: string;
  invoiceId: string;
  amount: number;
  method: string;
  note?: string;
}

function toPayment(row: {
  id: string;
  businessId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  method: string;
  note: string | null;
  paidAt: Date;
  createdAt: Date;
}): Payment {
  return {
    id: row.id,
    businessId: row.businessId,
    invoiceId: row.invoiceId,
    amount: row.amount,
    currency: row.currency,
    method: row.method,
    note: row.note,
    paidAt: row.paidAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Manual payment entry (bKash/Nagad/bank-transfer reference, cash) —
 * see the Payment model's own schema comment for why this isn't a real
 * gateway integration yet. Recording one recomputes the parent
 * Invoice's amountPaid/status server-side so those can never drift out
 * of sync with the actual payment rows. */
export class PaymentService {
  async record(input: RecordPaymentInput): Promise<Payment> {
    const row = await prisma.payment.create({
      data: {
        businessId: input.businessId,
        invoiceId: input.invoiceId,
        amount: input.amount,
        method: input.method,
        note: input.note,
      },
    });
    await this.reconcileInvoice(input.invoiceId);
    return toPayment(row);
  }

  /** Backs the Invoices panel's directly-editable Total/Paid/Due cells.
   * Total and Paid are independent -- either can be given alone, or
   * both together (same override-wins rule as
   * RepairOrderItem.overridePrice for total). A given `paidAmount`
   * replaces any prior payment rows instead of adding another on top of
   * them (that additive behavior was a real bug: a second payment on an
   * already-partially-paid invoice summed with the first, overshooting
   * the total) -- this is a "set the paid amount to exactly this" cell
   * edit, not itemized payment history. */
  async setAmounts(invoiceId: string, businessId: string, input: { total?: number; paidAmount?: number }): Promise<{ repairAppointmentId: string | null }> {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { repairAppointmentId: true } });
    if (input.total !== undefined) {
      await prisma.invoice.update({ where: { id: invoiceId }, data: { totalOverride: input.total } });
    }
    if (input.paidAmount !== undefined) {
      await prisma.payment.deleteMany({ where: { invoiceId } });
      if (input.paidAmount > 0) {
        await prisma.payment.create({ data: { businessId, invoiceId, amount: input.paidAmount, method: "manual" } });
      }
    }
    await this.reconcileInvoice(invoiceId);
    return { repairAppointmentId: invoice?.repairAppointmentId ?? null };
  }

  private async reconcileInvoice(invoiceId: string): Promise<void> {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { items: true, payments: true } });
    if (!invoice) return;
    const { total: computedTotal } = calcTotals(invoice.items, invoice.discount, invoice.tax);
    const total = invoice.totalOverride ?? computedTotal;
    const amountPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const status = amountPaid >= total && total > 0 ? "paid" : amountPaid > 0 ? "partially_paid" : invoice.status === "paid" || invoice.status === "partially_paid" ? "issued" : invoice.status;
    await prisma.invoice.update({ where: { id: invoiceId }, data: { amountPaid, status } });
  }

  async listForInvoice(invoiceId: string): Promise<Payment[]> {
    const rows = await prisma.payment.findMany({ where: { invoiceId }, orderBy: { paidAt: "desc" } });
    return rows.map(toPayment);
  }

  async listForBusiness(businessId?: string): Promise<Payment[]> {
    const rows = await prisma.payment.findMany({
      where: businessId ? { businessId } : {},
      orderBy: { paidAt: "desc" },
    });
    return rows.map(toPayment);
  }

  async delete(id: string): Promise<void> {
    const row = await prisma.payment.delete({ where: { id } });
    await this.reconcileInvoice(row.invoiceId);
  }
}
