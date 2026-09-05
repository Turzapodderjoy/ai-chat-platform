import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const config = await app.container.router.googleSignIn.getConfig(businessId);
  return NextResponse.json(config || { enabled: false, clientId: null });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const config = await app.container.router.googleSignIn.upsert({
    businessId: body.businessId,
    clientId: body.clientId || null,
    enabled: body.enabled ?? false,
  });
  return NextResponse.json(config);
}

export async function DELETE(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  await app.container.router.googleSignIn.delete(businessId);
  return NextResponse.json({ ok: true });
}
