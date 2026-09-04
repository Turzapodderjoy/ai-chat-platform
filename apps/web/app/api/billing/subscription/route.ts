import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";
import { verifyAdminToken } from "@ai-chat-platform/client-auth";

const CLIENT_COOKIE = "client_session";
const ADMIN_COOKIE = "admin_session";

// Client sessions carry their own businessId. An admin session (fixed
// admin_session cookie, or a ClientAccount with isAdmin) has none --
// same pattern as proxy.ts's own admin check -- so when an admin is
// looking at a client's dashboard (Admin view / Client view preview),
// this trusts the ?businessId= query param instead.
export async function GET(req: NextRequest) {
  const fixedAdmin = verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value);
  const clientToken = req.cookies.get(CLIENT_COOKIE)?.value;

  const session = clientToken
    ? await prisma.clientSession.findUnique({ where: { token: clientToken }, include: { account: true } })
    : null;
  const validSession = !!(session && session.expiresAt > new Date() && !session.account.disabled);
  const dbAdmin = validSession && session!.account.isAdmin;
  const isAdmin = fixedAdmin || dbAdmin;

  let businessId: string | null = null;
  if (validSession && !dbAdmin) {
    businessId = session!.account.businessId;
  } else if (isAdmin) {
    businessId = req.nextUrl.searchParams.get("businessId");
  }

  if (!businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
