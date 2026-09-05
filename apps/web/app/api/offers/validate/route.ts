import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.businessId || !body.code) {
    return NextResponse.json(
      { error: "businessId and code are required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const app = await getApp();
    const result = await app.container.router.offers.validate(body.businessId, body.code);
    return NextResponse.json(result, { headers: CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
