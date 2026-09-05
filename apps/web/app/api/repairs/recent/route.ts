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
  const email = req.nextUrl.searchParams.get("email");

  if (!businessId && !email) {
    return NextResponse.json({ error: "businessId or email is required" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const app = await getApp();
    let repairs = await app.container.router.repairs.listForBusiness(businessId || undefined);

    // If email is provided, filter by email (for "my repairs" lookup)
    if (email) {
      repairs = repairs.filter((r) => r.email?.toLowerCase() === email.toLowerCase());
    }

    // Strip PII and return only public-safe fields
    const safeRepairs = repairs.slice(0, 20).map((r) => ({
      trackingToken: r.trackingToken,
      deviceType: r.deviceType,
      status: r.status,
      appointmentDate: r.appointmentDate,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json({ repairs: safeRepairs }, { headers: CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { repairs: [], notice: "Repairs temporarily unavailable" },
      { status: 200, headers: CORS_HEADERS }
    );
  }
}
