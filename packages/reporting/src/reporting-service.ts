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

export interface PartsUsageItem {
  id: string;
  name: string;
  kind: string;
  quantity: number;
  orderId: string;
  trackingToken: string;
  customerName: string;
  costPrice: number | null;
  sellingPrice: number;
  date: string;
  usedBy: string | null;
}

export interface PartsUsageReport {
  items: PartsUsageItem[];
  totalCost: number;
  totalSelling: number;
  generatedAt: string;
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


export interface InventoryUsageRow {
  date: string;
  productId: string;
  productName: string;
  quantity: number;
  // Order # and invoice # are the same number now; kept separate for
  // older records where an order and its invoice differ.
  orderNumber: string | null;
  invoiceNumber: string | null;
  usedBy: string;
  costPrice: number | null;
  sellPrice: number;
  // The invoice's discount, shown on the first inventory line of that invoice.
  discount: number;
}

export interface InventoryUsageReport {
  rows: InventoryUsageRow[];
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
   * Appointments Success / Total Cost / Total Profit) — Appointments
   * Booked/Success stay scoped to `from`..`to` by when the appointment
   * was created (a genuine appointment-count metric), but Revenue is
   * real money actually collected in that window: the sum of Payment
   * rows by paidAt, the same figure the Invoices panel's own "Paid"
   * total reflects — not appointment line-item prices, which counted
   * money that was only ever billed, never necessarily collected, and
   * used the wrong date entirely (booked-date, not paid-date).
   *
   * Cost is Inventory's own cost basis (Product.costPrice) for whatever
   * was actually sold on those paid invoices -- traced through each
   * payment's invoice, either back to a linked repair appointment's
   * itemized parts (RepairOrderItem) or, for an invoice added by hand
   * with no repair appointment behind it, the invoice's own line items
   * (InvoiceItem). Either way, an item without a real Inventory product
   * still counts if a cost was typed in by hand for it
   * (RepairOrderItem.costPrice / InvoiceItem.costPrice) -- only a
   * custom item with NEITHER contributes $0 cost. */
  async getSummary(businessId: string | undefined, from: Date, to: Date): Promise<SummaryReport> {
    const paymentWhere = { ...(businessId ? { businessId } : {}), paidAt: { gte: from, lte: to } };
    const payments = await prisma.payment.findMany({ where: paymentWhere, select: { amount: true, invoiceId: true } });
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

    const invoiceIds = [...new Set(payments.map((p) => p.invoiceId))];
    const invoices = invoiceIds.length
      ? await prisma.invoice.findMany({
          where: { id: { in: invoiceIds } },
          select: { repairAppointmentId: true, items: { select: { productId: true, quantity: true, costPrice: true } } },
        })
      : [];
    const apptIds = [...new Set(invoices.map((i) => i.repairAppointmentId).filter((id): id is string => !!id))];
    const paidAppointments = apptIds.length
      ? await prisma.repairAppointment.findMany({ where: { id: { in: apptIds } }, select: { items: { select: { productId: true, quantity: true, costPrice: true } } } })
      : [];

    const productIds = [
      ...new Set([
        ...paidAppointments.flatMap((a) => a.items.map((i) => i.productId).filter((id): id is string => !!id)),
        ...invoices.flatMap((i) => i.items.map((it) => it.productId).filter((id): id is string => !!id)),
      ]),
    ];
    const products = productIds.length
      ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, costPrice: true } })
      : [];
    const costById = new Map(products.map((p) => [p.id, parseFloat(p.costPrice ?? "") || 0]));

    let totalCost = 0;
    for (const appt of paidAppointments) {
      for (const item of appt.items) {
        // The cost saved on the line when it was sold (its stock lot's cost) wins;
        // only a line from before that existed falls back to the product's CURRENT cost.
        const cost = item.costPrice ?? (item.productId ? (costById.get(item.productId) ?? 0) : 0);
        totalCost += cost * item.quantity;
      }
    }
    // Only count an invoice's OWN items when it has no repair appointment
    // behind it -- one already counted via paidAppointments above.
    for (const inv of invoices) {
      if (inv.repairAppointmentId) continue;
      for (const item of inv.items) {
        // The cost saved on the line when it was sold (its stock lot's cost) wins;
        // only a line from before that existed falls back to the product's CURRENT cost.
        const cost = item.costPrice ?? (item.productId ? (costById.get(item.productId) ?? 0) : 0);
        totalCost += cost * item.quantity;
      }
    }

    const appointments = await prisma.repairAppointment.findMany({
      where: { ...(businessId ? { businessId } : {}), createdAt: { gte: from, lte: to } },
      select: { status: true },
    });

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
      prisma.invoice.findMany({ where, select: { status: true, discount: true, tax: true, amountPaid: true, totalOverride: true, items: { select: { quantity: true, unitPrice: true } } } }),
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
      // Same override-wins rule as InvoiceService.toInvoice -- confirmed
      // live, this previously ignored totalOverride entirely and always
      // summed raw item price, overstating Total Invoiced/Outstanding by
      // exactly the gap between an invoice's itemized total and whatever
      // it was actually marked "Paid" at (the everyday case: every "Paid"
      // action sets totalOverride to a different amount than the items).
      const subtotal = inv.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
      const total = inv.totalOverride ?? Math.max(0, subtotal - inv.discount + inv.tax);
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

  /** Every inventory product used in the range: which order/invoice, how
   * many, who added it, its cost (snapshotted from the stock lots it came
   * from) and the price it was billed at, plus the invoice's discount. */
  async getInventoryUsage(businessId: string, from?: Date, to?: Date): Promise<InventoryUsageReport> {
    const createdAt = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;

    const [orderItems, invoiceItems] = await Promise.all([
      prisma.repairOrderItem.findMany({
        where: { productId: { not: null }, repairAppointment: { businessId }, ...(createdAt ? { createdAt } : {}) },
        include: { repairAppointment: { select: { id: true, serialNumber: true } } },
      }),
      prisma.invoiceItem.findMany({
        where: { productId: { not: null }, invoice: { businessId, repairAppointmentId: null, ...(createdAt ? { createdAt } : {}) } },
        include: { invoice: { select: { id: true, invoiceNumber: true, discount: true, createdAt: true } } },
      }),
    ]);

    const appointmentIds = [...new Set(orderItems.map((i) => i.repairAppointment.id))];
    const invoices = appointmentIds.length
      ? await prisma.invoice.findMany({ where: { repairAppointmentId: { in: appointmentIds } }, include: { items: true } })
      : [];
    const invoiceByAppointment = new Map(invoices.map((inv) => [inv.repairAppointmentId as string, inv]));

    const productIds = [...new Set([...orderItems, ...invoiceItems].map((i) => i.productId as string))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, costPrice: true } });
    const productById = new Map(products.map((p) => [p.id, p]));
    const liveCost = (id: string) => {
      const n = parseFloat(productById.get(id)?.costPrice ?? "");
      return isNaN(n) ? null : n;
    };

    const orderAudit = orderItems.length
      ? await prisma.auditLog.findMany({ where: { entityType: "order-item", action: "item_added", entityId: { in: orderItems.map((i) => i.id) } } })
      : [];
    const invoiceAudit = invoiceItems.length
      ? await prisma.auditLog.findMany({ where: { entityType: "invoice", action: "generated", entityId: { in: [...new Set(invoiceItems.map((i) => i.invoice.id))] } } })
      : [];
    const whoOrder = new Map(orderAudit.map((a) => [a.entityId, a.actorUsername]));
    const whoInvoice = new Map(invoiceAudit.map((a) => [a.entityId, a.actorUsername]));

    const rows: InventoryUsageRow[] = [];
    const discountShown = new Set<string>();

    for (const item of orderItems) {
      const invoice = invoiceByAppointment.get(item.repairAppointment.id);
      // The invoice line is what the customer was actually billed; fall
      // back to the order line's own price when no invoice exists yet.
      const billed = invoice?.items.find((l) => l.name === item.name);
      const key = invoice?.id ?? item.repairAppointment.id;
      const discount = discountShown.has(key) ? 0 : invoice?.discount ?? 0;
      discountShown.add(key);
      rows.push({
        date: item.createdAt.toISOString(),
        productId: item.productId as string,
        productName: productById.get(item.productId as string)?.name ?? item.name,
        quantity: item.quantity,
        orderNumber: item.repairAppointment.serialNumber,
        invoiceNumber: invoice?.invoiceNumber ?? null,
        usedBy: whoOrder.get(item.id) ?? "unknown",
        costPrice: item.costPrice ?? liveCost(item.productId as string),
        sellPrice: billed?.unitPrice ?? item.overridePrice ?? item.defaultPrice,
        discount,
      });
    }

    for (const item of invoiceItems) {
      const key = item.invoice.id;
      const discount = discountShown.has(key) ? 0 : item.invoice.discount;
      discountShown.add(key);
      rows.push({
        date: item.invoice.createdAt.toISOString(),
        productId: item.productId as string,
        productName: productById.get(item.productId as string)?.name ?? item.name,
        quantity: item.quantity,
        orderNumber: null,
        invoiceNumber: item.invoice.invoiceNumber,
        usedBy: whoInvoice.get(item.invoice.id) ?? "unknown",
        costPrice: item.costPrice ?? liveCost(item.productId as string),
        sellPrice: item.unitPrice,
        discount,
      });
    }

    rows.sort((a, b) => b.date.localeCompare(a.date));
    return { rows };
  }

  /** Parts/services usage report: every RepairOrderItem (kind=part or
   * service) joined with its parent RepairAppointment, Product (if
   * inventory-linked), and AuditLog entry (who added it). Date range
   * filters by RepairOrderItem.createdAt. */
  async getPartsUsage(businessId: string | undefined, from?: Date, to?: Date): Promise<PartsUsageReport> {
    const where: Record<string, unknown> = {};
    if (businessId) where.businessId = businessId;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = from;
      if (to) (where.createdAt as Record<string, Date>).lte = to;
    }

    const rows = await prisma.repairOrderItem.findMany({
      where: { kind: "part", repairAppointment: where },
      include: {
        repairAppointment: { select: { id: true, trackingToken: true, customerName: true, businessId: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Batch-fetch products for inventory-linked items
    const productIds = [...new Set(rows.map((r) => r.productId).filter((id): id is string => !!id))];
    const products = productIds.length
      ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, costPrice: true } })
      : [];
    const costByProduct = new Map(products.map((p) => [p.id, parseFloat(p.costPrice ?? "") || 0]));

    // Batch-fetch audit logs for "item_added" actions on these items
    const itemIds = rows.map((r) => r.id);
    const auditLogs = itemIds.length
      ? await prisma.auditLog.findMany({
          where: { entityType: "order-item", entityId: { in: itemIds }, action: "item_added" },
          select: { entityId: true, actorUsername: true },
        })
      : [];
    const actorByItemId = new Map(auditLogs.map((a) => [a.entityId, a.actorUsername]));

    let totalCost = 0;
    let totalSelling = 0;

    const items: PartsUsageItem[] = rows.map((row) => {
      const costPrice = row.productId ? (costByProduct.get(row.productId) ?? null) : (row.costPrice ?? null);
      const sellingPrice = row.overridePrice ?? row.defaultPrice * row.quantity;
      const effectiveCost = costPrice != null ? costPrice * row.quantity : 0;
      totalCost += effectiveCost;
      totalSelling += sellingPrice;

      return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        quantity: row.quantity,
        orderId: row.repairAppointmentId,
        trackingToken: row.repairAppointment.trackingToken,
        customerName: row.repairAppointment.customerName,
        costPrice,
        sellingPrice,
        date: row.createdAt.toISOString(),
        usedBy: actorByItemId.get(row.id) ?? null,
      };
    });

    return { items, totalCost, totalSelling, generatedAt: new Date().toISOString() };
  }
}
