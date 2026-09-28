import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

// Wave B #18 - Team chat / internal staff messaging. Lightweight group inbox:
// GET returns recent messages (joined with the author's Staff name) plus the
// list of staff members so the panel can attribute a new message. POST appends
// one message. No read receipts / push in this Wave B pass (see TEST-REPORT).

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;

  const messages = await prisma.teamMessage.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { staff: true },
  });
  const staff = await prisma.staff.findMany({
    where: { businessId, active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ messages, staff });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    businessId?: string;
    staffId?: string;
    body?: string;
  } | null;

  if (!body?.businessId || !body?.body?.trim()) {
    return NextResponse.json(
      { error: "businessId and body are required" },
      { status: 400 },
    );
  }

  const message = await prisma.teamMessage.create({
    data: {
      businessId: body.businessId,
      staffId: body.staffId ?? null,
      body: body.body.trim(),
    },
    include: { staff: true },
  });
  return NextResponse.json({ message }, { status: 201 });
}