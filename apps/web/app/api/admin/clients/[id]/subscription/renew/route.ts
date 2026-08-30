import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const business = await prisma.business.findUnique({ where: { id } });
    if (!business) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Extend end date by 1 month from current end date (or from now if no end date)
    const currentEnd = business.subscriptionEndDate ? new Date(business.subscriptionEndDate) : new Date();
    const newEnd = new Date(currentEnd);
    newEnd.setMonth(newEnd.getMonth() + 1);

    // If no start date, set it to now
    const newStart = business.subscriptionStartDate ? business.subscriptionStartDate : new Date();

    const updated = await prisma.business.update({
      where: { id },
      data: {
        subscriptionStartDate: newStart,
        subscriptionEndDate: newEnd,
        subscriptionActive: true,
      },
    });

    return NextResponse.json({ ok: true, business: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
