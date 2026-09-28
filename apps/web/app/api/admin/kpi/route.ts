import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

// Wave B #29 - KPI dashboard cards. All values are DERIVED from existing
// tables (counts), so there is no KpiCard table to keep in sync — the panel
// renders what this route returns. "sales" = Order rows (the Order model has
// no money column; count + recency are the available KPIs).

async function countWhere(compute: () => Promise<number>): Promise<number> {
  try {
    return await compute();
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [orders24h, ordersTotal, purchaseOrders, repairs24h, repairsTotal, messages24h, shifts, staff, locations] =
    await Promise.all([
      countWhere(() => prisma.order.count({ where: { businessId, createdAt: { gte: since24h } } })),
      countWhere(() => prisma.order.count({ where: { businessId } })),
      countWhere(() => prisma.purchaseOrder.count({ where: { businessId } })),
      countWhere(() => prisma.repairAppointment.count({ where: { businessId, createdAt: { gte: since24h } } })),
      countWhere(() => prisma.repairAppointment.count({ where: { businessId } })),
      countWhere(() => prisma.teamMessage.count({ where: { businessId, createdAt: { gte: since24h } } })),
      countWhere(() => prisma.shift.count({ where: { businessId } })),
      countWhere(() => prisma.staff.count({ where: { businessId } })),
      countWhere(() => prisma.location.count({ where: { businessId } })),
    ]);

  const cards = [
    { id: "orders-24h", label: "Orders (24h)", value: orders24h, hint: `${ordersTotal} total` },
    { id: "purchase-orders", label: "Purchase Orders", value: purchaseOrders, hint: "on file" },
    { id: "repairs-24h", label: "Repairs (24h)", value: repairs24h, hint: `${repairsTotal} total` },
    { id: "team-msgs-24h", label: "Team Messages (24h)", value: messages24h, hint: "internal chat" },
    { id: "shifts", label: "Shifts", value: shifts, hint: "scheduled" },
    { id: "staff", label: "Staff", value: staff, hint: "on roster" },
    { id: "locations", label: "Locations", value: locations, hint: "active sites" },
  ];

  return NextResponse.json({ businessId, generatedAt: new Date().toISOString(), cards });
}