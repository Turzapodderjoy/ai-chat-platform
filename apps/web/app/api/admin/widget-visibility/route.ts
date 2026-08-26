import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }
  const app = await getApp();
  const hidden = await app.container.router.widgetVisibility.listHidden(businessId);
  return NextResponse.json({ hidden });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || typeof body.widgetId !== "string") {
    return NextResponse.json({ error: "businessId and widgetId are required" }, { status: 400 });
  }
  const app = await getApp();
  await app.container.router.widgetVisibility.hide(body.businessId, body.widgetId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  const widgetId = req.nextUrl.searchParams.get("widgetId");
  if (!businessId || !widgetId) {
    return NextResponse.json({ error: "businessId and widgetId are required" }, { status: 400 });
  }
  const app = await getApp();
  await app.container.router.widgetVisibility.show(businessId, widgetId);
  return NextResponse.json({ ok: true });
}
