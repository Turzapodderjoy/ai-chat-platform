import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Request body is required" }, { status: 400 });
  }

  try {
    const business = await prisma.business.findUnique({ where: { id } });
    if (!business) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const updated = await prisma.business.update({
      where: { id },
      data: {
        subscriptionPlanName: body.subscriptionPlanName ?? business.subscriptionPlanName,
        subscriptionFee: body.subscriptionFee ?? business.subscriptionFee,
        subscriptionCurrency: body.subscriptionCurrency ?? business.subscriptionCurrency,
        subscriptionStartDate: body.subscriptionStartDate ? new Date(body.subscriptionStartDate) : business.subscriptionStartDate,
        subscriptionEndDate: body.subscriptionEndDate ? new Date(body.subscriptionEndDate) : business.subscriptionEndDate,
        subscriptionActive: body.subscriptionActive ?? business.subscriptionActive,
      },
    });

    return NextResponse.json({ ok: true, business: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
