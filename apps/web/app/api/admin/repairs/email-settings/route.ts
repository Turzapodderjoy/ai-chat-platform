import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const result = await app.container.router.email.getSenderConfig(businessId);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string" || typeof body.fromName !== "string" || typeof body.fromEmail !== "string") {
    return NextResponse.json({ error: "businessId, fromName and fromEmail are required" }, { status: 400 });
  }

  const app = await getApp();
  const result = await app.container.router.email.saveSenderConfig(body.businessId, {
    fromName: body.fromName,
    fromEmail: body.fromEmail,
    trackingPageUrl: typeof body.trackingPageUrl === "string" && body.trackingPageUrl.trim() ? body.trackingPageUrl : undefined,
  });
  return NextResponse.json(result);
}
