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

export interface SalesReport {
  dealsByStage: { stage: string; count: number; value: number }[];
  openPipelineValue: number;
  wonValueAllTime: number;
  wonValueThisMonth: number;
  winRate: number | null;
  avgWonDealSize: number | null;
  lossReasons: { reason: string; count: number }[];
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
  totalCompanies: number;
}

export interface OverviewReport {
  revenue: RevenueReport;
  sales: SalesReport;
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
 * QuoteService/InvoiceService/DealService, the same reasoning
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
      deals,
      orders,
      appointments,
      totalContacts,
      newContactsThisWeek,
      newContactsThisMonth,
      totalCompanies,
    ] = await Promise.all([
      prisma.invoice.findMany({ where, select: { status: true, discount: true, tax: true, amountPaid: true, items: { select: { quantity: true, unitPrice: true } } } }),
      prisma.quote.findMany({ where, select: { status: true } }),
      prisma.payment.findMany({ where, select: { amount: true, paidAt: true } }),
      prisma.deal.findMany({ where, select: { stage: true, status: true, amount: true, lostReason: true, updatedAt: true } }),
      prisma.order.findMany({ where, select: { deliveryStatus: true } }),
      prisma.repairAppointment.findMany({ where, select: { status: true } }),
      prisma.contact.count({ where }),
      prisma.contact.count({ where: { ...where, createdAt: { gte: week } } }),
      prisma.contact.count({ where: { ...where, createdAt: { gte: thisMonth } } }),
      prisma.company.count({ where }),
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

    // --- Sales (Deals) ---
    const stageMap = new Map<string, { count: number; value: number }>();
    for (const d of deals) {
      const bucket = stageMap.get(d.stage) ?? { count: 0, value: 0 };
      bucket.count += 1;
      bucket.value += d.amount ?? 0;
      stageMap.set(d.stage, bucket);
    }
    const dealsByStage = Array.from(stageMap.entries()).map(([stage, v]) => ({ stage, ...v }));
    const openDeals = deals.filter((d) => d.status === "open");
    const wonDeals = deals.filter((d) => d.status === "won");
    const lostDeals = deals.filter((d) => d.status === "lost");
    const openPipelineValue = openDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
    const wonValueAllTime = wonDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
    const wonValueThisMonth = wonDeals.filter((d) => d.updatedAt >= thisMonth).reduce((sum, d) => sum + (d.amount ?? 0), 0);
    const winRate = wonDeals.length + lostDeals.length > 0 ? wonDeals.length / (wonDeals.length + lostDeals.length) : null;
    const avgWonDealSize = wonDeals.length > 0 ? wonValueAllTime / wonDeals.length : null;
    const lossReasonMap = new Map<string, number>();
    for (const d of lostDeals) {
      const reason = d.lostReason ?? "(no reason given)";
      lossReasonMap.set(reason, (lossReasonMap.get(reason) ?? 0) + 1);
    }
    const lossReasons = Array.from(lossReasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

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
      sales: {
        dealsByStage,
        openPipelineValue,
        wonValueAllTime,
        wonValueThisMonth,
        winRate,
        avgWonDealSize,
        lossReasons,
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
        totalCompanies,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
