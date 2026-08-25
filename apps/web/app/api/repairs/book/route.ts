import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

// Runs on the client's own separately-hosted site (a different origin) —
// same CORS reasoning as /api/chat/route.ts: no cookies/credentials, and
// businessId is public info baked into that site's booking form already.
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

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  const required = ["businessId", "customerName", "phone", "deviceType", "issueDescription", "appointmentDate"];
  const missing = required.filter((k) => typeof body[k] !== "string" || body[k].trim() === "");

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing/invalid: ${missing.join(", ")}` },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const app = await getApp();
    const result = await app.container.router.repairs.book({
      businessId: body.businessId,
      customerName: body.customerName,
      phone: body.phone,
      email: typeof body.email === "string" ? body.email : undefined,
      deviceType: body.deviceType,
      deviceModel: typeof body.deviceModel === "string" ? body.deviceModel : undefined,
      issueDescription: body.issueDescription,
      appointmentDate: body.appointmentDate,
    });
    return NextResponse.json(result, { headers: CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
