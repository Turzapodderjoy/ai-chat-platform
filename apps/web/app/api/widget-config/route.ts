import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../lib/app";

// widget.js runs on the CLIENT's own website (a different origin from
// wherever this app is deployed) — same reasoning as /api/chat's CORS
// setup. Config here is non-sensitive cosmetic settings, so wide open
// is fine.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

  const app = await getApp();
  const config = await app.container.router.widgetConfig.get(businessId);
  return NextResponse.json(config, { headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string") {
    return NextResponse.json({ error: "businessId is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const { businessId, ...input } = body;

  try {
    const app = await getApp();
    const config = await app.container.router.widgetConfig.save(businessId, input);
    return NextResponse.json(config, { headers: CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400, headers: CORS_HEADERS }
    );
  }
}
