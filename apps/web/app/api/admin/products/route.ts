import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/** Product Catalog panel's data source — search + offset pagination. */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const search = req.nextUrl.searchParams.get("search") ?? undefined;
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "25");

  const app = await getApp();
  const result = await app.container.router.products.list(businessId, search, offset, limit);
  return NextResponse.json(result);
}
