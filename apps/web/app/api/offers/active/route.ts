import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const app = await getApp();
    const allOffers = await app.container.router.offers.listForBusiness(businessId);
    const activeOffers = allOffers.filter((o) => o.isActive);
    return NextResponse.json({ offers: activeOffers.slice(0, 20) }, { headers: CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { offers: [], notice: "Offers temporarily unavailable" },
      { status: 200, headers: CORS_HEADERS }
    );
  }
}
