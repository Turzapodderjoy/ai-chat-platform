import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const items = await prisma.closingChecklistItem.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ items });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || !body.item) {
    return NextResponse.json({ error: "businessId and item are required" }, { status: 400 });
  }

  const item = await prisma.closingChecklistItem.upsert({
    where: { businessId_itemId: { businessId: body.businessId, itemId: body.item.id } },
    update: {
      label: body.item.label,
      category: body.item.category,
      required: body.item.required,
      completed: body.item.completed,
      completedAt: body.item.completedAt ? new Date(body.item.completedAt) : null,
      completedBy: body.item.completedBy ?? null,
      note: body.item.note ?? null,
    },
    create: {
      businessId: body.businessId,
      itemId: body.item.id,
      label: body.item.label,
      category: body.item.category,
      required: body.item.required,
      completed: body.item.completed,
      completedAt: body.item.completedAt ? new Date(body.item.completedAt) : null,
      completedBy: body.item.completedBy ?? null,
      note: body.item.note ?? null,
    },
  });
  return NextResponse.json(item);
}