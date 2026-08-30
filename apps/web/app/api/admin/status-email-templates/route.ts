import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const templates = await app.container.router.statusEmailTemplates.listForBusiness(businessId);
  return NextResponse.json({ templates });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.businessId !== "string" ||
    (body.kind !== "order_status" && body.kind !== "repair_status") ||
    typeof body.statusValue !== "string" ||
    typeof body.subject !== "string" ||
    typeof body.bodyHtml !== "string"
  ) {
    return NextResponse.json({ error: "businessId, kind, statusValue, subject, and bodyHtml are required" }, { status: 400 });
  }

  const app = await getApp();
  const template = await app.container.router.statusEmailTemplates.upsert(body.businessId, body.kind, body.statusValue, {
    subject: body.subject,
    bodyHtml: body.bodyHtml,
    enabled: body.enabled !== false,
  });
  return NextResponse.json(template);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const app = await getApp();
  await app.container.router.statusEmailTemplates.delete(id);
  return NextResponse.json({ ok: true });
}
