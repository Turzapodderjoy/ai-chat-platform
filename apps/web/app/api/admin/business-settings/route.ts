import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

/** GET — returns the business's enabledIntegrations list.
 * PUT — updates the enabledIntegrations list. */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const enabled = business.enabledIntegrations ? JSON.parse(business.enabledIntegrations) : null;
  return NextResponse.json({ enabledIntegrations: enabled });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string") {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const enabledIntegrations = Array.isArray(body.enabledIntegrations) ? JSON.stringify(body.enabledIntegrations) : null;

  await prisma.business.update({
    where: { id: body.businessId },
    data: { enabledIntegrations },
  });

  return NextResponse.json({ ok: true });
}
