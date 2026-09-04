import { prisma } from "@ai-chat-platform/database";

export interface RevenueReport {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  collectedThisMonth: number;
  collectedLastMonth: number;
  invoicesByStatus: Record<string, number>;
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

// The date-ranged summary row -- separate from the sections below (which
// stay all-time/this-month) since this is specifically what the date
// filter dropdown on the Reports page controls.
export interface SummaryReport {
  totalRevenue: number;
  appointmentsBooked: number;
  appointmentsSuccess: number;
  totalCost: number;
  totalProfit: number;
}

export interface OverviewReport {
  summary: SummaryReport;
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
 * InvoiceService, the same reasoning ContactService.getRecord already
 * used: this cuts across revenue/crm/conversation without introducing
 * circular workspace dependencies between those packages. */
export class ReportingService {
  /** The date-ranged summary row (Total Revenue / Appointments Booked /
   * Appointments Success / Total Cost / Total Profit) — scoped to
   * `from`..`to` by when the appointment was booked (createdAt).
   * Revenue/cost/profit are computed off each appointment's own
   * RepairOrderItem lines (the actual priced billing layer), not
   * generic Invoices, since only order items carry a cost basis
   * (Product.costPrice) to compute profit against. */
  async getSummary(businessId: string | undefined, from: Date, to: Date): Promise<SummaryReport> {
    const where = { ...(businessId ? { businessId } : {}), createdAt: { gte: from, lte: to } };

    const appointments = await prisma.repairAppointment.findMany({
      where,
      select: {
        status: true,
        items: { select: { productId: true, quantity: true, defaultPrice: true, overridePrice: true } },
      },
    });

    const productIds = [...new Set(appointments.flatMap((a) => a.items.map((i) => i.productId).filter((id): id is string => !!id)))];
    const products = productIds.length
      ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, costPrice: true } })
      : [];
    const costById = new Map(products.map((p) => [p.id, parseFloat(p.costPrice ?? "") || 0]));

    let totalRevenue = 0;
    let totalCost = 0;
    for (const appt of appointments) {
      for (const item of appt.items) {
        const finalPrice = item.overridePrice ?? item.defaultPrice * item.quantity;
        totalRevenue += finalPrice;
        if (item.productId) totalCost += (costById.get(item.productId) ?? 0) * item.quantity;
      }
    }

    return {
      totalRevenue,
      appointmentsBooked: appointments.length,
      appointmentsSuccess: appointments.filter((a) => a.status === "completed").length,
      totalCost,
      totalProfit: totalRevenue - totalCost,
    };
  }

  async getOverview(businessId?: string, from?: Date, to?: Date): Promise<OverviewReport> {
    const where = businessId ? { businessId } : {};
    const thisMonth = startOfMonth(0);
    const lastMonth = startOfMonth(-1);
    const week = startOfWeek();
    const summaryRange = from && to ? [from, to] : [startOfMonth(0), new Date()];

    const [
      summary,
      invoices,
      payments,
      orders,
      appointments,
      totalContacts,
      newContactsThisWeek,
      newContactsThisMonth,
    ] = await Promise.all([
      this.getSummary(businessId, summaryRange[0]!, summaryRange[1]!),
      prisma.invoice.findMany({ where, select: { status: true, discount: true, tax: true, amountPaid: true, items: { select: { quantity: true, unitPrice: true } } } }),
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
      summary,
      revenue: {
        totalInvoiced,
        totalCollected,
        totalOutstanding,
        collectedThisMonth,
        collectedLastMonth,
        invoicesByStatus,
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
