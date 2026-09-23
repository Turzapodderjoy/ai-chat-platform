import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

/** Low-stock count feed for the inventory nav badge — businessId required,
 * mirrors the repairs badge route convention (client-dashboard-client refetches
 * on a 5s interval). */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }
  const app = await getApp();
  const count = await app.container.router.products.countLowStock(businessId);
  return NextResponse.json({ count });
}