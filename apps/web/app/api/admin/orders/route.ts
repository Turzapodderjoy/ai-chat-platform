import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/** Orders panel's data source — orders the AI takes directly inside a
 * chat conversation. */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const result = await app.container.router.orders.list(businessId);
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const app = await getApp();
  const result = await app.container.router.orders.updateDelivery(body.id, {
    email: typeof body.email === "string" ? body.email : body.email === null ? null : undefined,
    courier: typeof body.courier === "string" ? body.courier : undefined,
    trackingId: typeof body.trackingId === "string" ? body.trackingId : undefined,
    deliveryStatus: typeof body.deliveryStatus === "string" ? body.deliveryStatus : undefined,
  });
  return NextResponse.json(result);
}
