import { prisma } from "@ai-chat-platform/database";

export interface RevenueReport {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  collectedThisMonth: number;
  collectedLastMonth: number;
  invoicesByStatus: Record<string, number>;
  quotesByStatus: Record<string, number>;
  quoteAcceptanceRate: number | null;
}

export interface DeliveryReport {
  totalOrders: number;
  ordersByDeliveryStatus: Record<string, number>;
  deliveredRate: number | null;
}

export interface RepairsReport {
  totalAppointments: number;
  appointmentsByStatus: Record<string, number>;
}

export interface CrmReport {
  totalContacts: number;
  newContactsThisWeek: number;
  newContactsThisMonth: number;
}

export interface OverviewReport {
  revenue: RevenueReport;
  delivery: DeliveryReport;
  repairs: RepairsReport;
  crm: CrmReport;
  generatedAt: string;
}

function startOfMonth(offset = 0): Date {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function bucketCount<T extends string>(rows: { field: T }[], keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) out[r.field] = (out[r.field] ?? 0) + 1;
  return out;
}

/** Cross-domain reporting, deliberately read-only and computed fresh on
 * every call (query volume here is a handful of aggregate SQL calls
 * against a few thousand rows at most for this platform's real scale —
 * a materialized-view/caching layer is real scope creep until that
 * stops being true). Queries prisma directly rather than importing
 * QuoteService/InvoiceService, the same reasoning
 * ContactService.getRecord already used: this cuts across
 * revenue/crm/conversation without introducing circular workspace
 * dependencies between those packages. */
export class ReportingService {
  async getOverview(businessId?: string): Promise<OverviewReport> {
    const where = businessId ? { businessId } : {};
    const thisMonth = startOfMonth(0);
    const lastMonth = startOfMonth(-1);
    const week = startOfWeek();

    const [
      invoices,
      quotes,
      payments,
      orders,
      appointments,
      totalContacts,
      newContactsThisWeek,
      newContactsThisMonth,
    ] = await Promise.all([
      prisma.invoice.findMany({ where, select: { status: true, discount: true, tax: true, amountPaid: true, items: { select: { quantity: true, unitPrice: true } } } }),
      prisma.quote.findMany({ where, select: { status: true } }),
      prisma.payment.findMany({ where, select: { amount: true, paidAt: true } }),
      prisma.order.findMany({ where, select: { deliveryStatus: true } }),
      prisma.repairAppointment.findMany({ where, select: { status: true } }),
      prisma.contact.count({ where }),
      prisma.contact.count({ where: { ...where, createdAt: { gte: week } } }),
      prisma.contact.count({ where: { ...where, createdAt: { gte: thisMonth } } }),
    ]);

    // --- Revenue ---
    let totalInvoiced = 0;
    let totalOutstanding = 0;
    const invoicesByStatus: Record<string, number> = {};
    for (const inv of invoices) {
      const subtotal = inv.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
      const total = Math.max(0, subtotal - inv.discount + inv.tax);
      totalInvoiced += total;
      if (inv.status !== "void") totalOutstanding += Math.max(0, total - inv.amountPaid);
      invoicesByStatus[inv.status] = (invoicesByStatus[inv.status] ?? 0) + 1;
    }
    const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
    const collectedThisMonth = payments.filter((p) => p.paidAt >= thisMonth).reduce((sum, p) => sum + p.amount, 0);
    const collectedLastMonth = payments
      .filter((p) => p.paidAt >= lastMonth && p.paidAt < thisMonth)
      .reduce((sum, p) => sum + p.amount, 0);

    const quotesByStatus: Record<string, number> = {};
    for (const q of quotes) quotesByStatus[q.status] = (quotesByStatus[q.status] ?? 0) + 1;
    const decidedQuotes = (quotesByStatus.accepted ?? 0) + (quotesByStatus.rejected ?? 0) + (quotesByStatus.expired ?? 0);
    const quoteAcceptanceRate = decidedQuotes > 0 ? (quotesByStatus.accepted ?? 0) / decidedQuotes : null;

    // --- Delivery (Orders) ---
    const ordersByDeliveryStatus = bucketCount(
      orders.map((o) => ({ field: o.deliveryStatus })),
      ["pending", "picked_up", "in_transit", "delivered", "returned"]
    );
    const deliveredRate = orders.length > 0 ? (ordersByDeliveryStatus.delivered ?? 0) / orders.length : null;

    // --- Repairs ---
    const appointmentsByStatus = bucketCount(
      appointments.map((a) => ({ field: a.status })),
      ["booked", "received", "in_repair", "ready", "completed", "cancelled"]
    );

    return {
      revenue: {
        totalInvoiced,
        totalCollected,
        totalOutstanding,
        collectedThisMonth,
        collectedLastMonth,
        invoicesByStatus,
        quotesByStatus,
        quoteAcceptanceRate,
      },
      delivery: {
        totalOrders: orders.length,
        ordersByDeliveryStatus,
        deliveredRate,
      },
      repairs: {
        totalAppointments: appointments.length,
        appointmentsByStatus,
      },
      crm: {
        totalContacts,
        newContactsThisWeek,
        newContactsThisMonth,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
