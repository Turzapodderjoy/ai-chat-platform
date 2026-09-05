import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const config = await app.container.router.gmailSenderConfig.get(businessId);
  return NextResponse.json({
    businessId: config.businessId,
    gmailAddress: config.gmailAddress,
    connected: Boolean(config.gmailAddress && (config.appPassword || config.accessToken)),
    oauthConnected: Boolean(config.accessToken),
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || typeof body.gmailAddress !== "string") {
    return NextResponse.json({ error: "businessId and gmailAddress are required" }, { status: 400 });
  }

  const app = await getApp();
  await app.container.router.gmailSenderConfig.save(body.businessId, {
    gmailAddress: body.gmailAddress,
    appPassword: typeof body.appPassword === "string" ? body.appPassword : undefined,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  await app.container.router.gmailSenderConfig.disconnect(businessId);
  return NextResponse.json({ ok: true });
}
