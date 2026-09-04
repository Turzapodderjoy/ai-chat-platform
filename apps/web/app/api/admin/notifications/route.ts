import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }
  const app = await getApp();
  const notifications = await app.container.router.adminNotifications.listForBusiness(businessId);
  return NextResponse.json({ notifications });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "businessId and title are required" }, { status: 400 });
  }
  const app = await getApp();
  const notification = await app.container.router.adminNotifications.create(body.businessId, body.title.trim(), body.body ?? "");
  return NextResponse.json(notification);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const app = await getApp();
  await app.container.router.adminNotifications.delete(id);
  return NextResponse.json({ ok: true });
}
