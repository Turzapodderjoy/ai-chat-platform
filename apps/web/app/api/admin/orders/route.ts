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
