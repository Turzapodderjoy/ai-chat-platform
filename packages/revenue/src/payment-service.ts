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

  private async reconcileInvoice(invoiceId: string): Promise<void> {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { items: true, payments: true } });
    if (!invoice) return;
    const { total } = calcTotals(invoice.items, invoice.discount, invoice.tax);
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
