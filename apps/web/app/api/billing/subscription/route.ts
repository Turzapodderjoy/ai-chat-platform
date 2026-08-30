import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

const CLIENT_COOKIE = "client_session";

export async function GET(req: NextRequest) {
  const clientToken = req.cookies.get(CLIENT_COOKIE)?.value;

  if (!clientToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await prisma.clientSession.findUnique({
    where: { token: clientToken },
    include: { account: true },
  });

  if (!session || session.expiresAt <= new Date() || session.account.disabled) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const businessId = session.account.businessId;
  if (!businessId) {
    return NextResponse.json({ error: "No business associated" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      subscriptionPlanName: true,
      subscriptionFee: true,
      subscriptionCurrency: true,
      subscriptionStartDate: true,
      subscriptionEndDate: true,
      subscriptionActive: true,
    },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  return NextResponse.json({ subscription: business });
}
