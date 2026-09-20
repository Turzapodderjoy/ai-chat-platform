import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

/** Stock lots for one product, newest first: quantity received, what's
 * left, cost and sell price, when and by whom. */
export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }
  const app = await getApp();
  const lots = await app.container.router.products.listLots(productId);
  return NextResponse.json({ lots });
}
