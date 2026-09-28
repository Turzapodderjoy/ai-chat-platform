import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

// Wave B #8 - Purchase Orders admin API. Buy-side restock flow: the Closing
// Checklist and Repairs routes are the closest siblings (businessId-scoped
// Prisma access, no auth actor needed for the data, money stays String).
// status lifecycle: draft -> sent -> partially_received -> received | cancelled

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const supplierId = req.nextUrl.searchParams.get("supplierId") ?? undefined;
  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  const orders = await prisma.purchaseOrder.findMany({
    where: { businessId, supplierId, status },
    orderBy: { orderDate: "desc" },
    include: {
      supplier: true,
      items: true,
    },
  });
  const suppliers = await prisma.supplier.findMany({
    where: { businessId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ orders, suppliers });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    businessId?: string;
    supplierId?: string;
    orderDate?: string;
    expectedDelivery?: string;
    notes?: string;
    items?: {
      productId?: string;
      productName?: string;
      quantity?: number;
      unitCost?: string;
    }[];
  } | null;

  if (!body?.businessId || !body.supplierId || !Array.isArray(body.items)) {
    return NextResponse.json(
      { error: "businessId, supplierId, and items are required" },
      { status: 400 },
    );
  }

  const items = body.items.map((item) => ({
    productId: item.productId ?? null,
    productName: item.productName ?? "",
    quantity: item.quantity ?? 0,
    unitCost: item.unitCost ?? "0",
  }));

  const order = await prisma.purchaseOrder.create({
    data: {
      businessId: body.businessId,
      supplierId: body.supplierId,
      orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
      expectedDelivery: body.expectedDelivery ? new Date(body.expectedDelivery) : null,
      notes: body.notes,
      items: { create: items },
    },
    include: { supplier: true, items: true },
  });
  return NextResponse.json({ order }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    status?: string;
    action?: string;
    items?: { id?: string; itemId?: string; receivedQty?: number }[];
  } | null;

  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const actionStatus: Record<string, string> = {
    send: "sent",
    partial: "partially_received",
    received: "received",
    cancelled: "cancelled",
  };
  const status = body.status ?? actionStatus[body.action ?? ""] ?? body.action;
  const order = await prisma.purchaseOrder.update({
    where: { id: body.id },
    data: {
      status,
      items: body.items?.length
        ? {
            update: body.items.map((item) => ({
              where: { id: item.id ?? item.itemId ?? "" },
              data: { receivedQty: item.receivedQty },
            })),
          }
        : undefined,
    },
    include: { supplier: true, items: true },
  });
  return NextResponse.json({ order });
}
