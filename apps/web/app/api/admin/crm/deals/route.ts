import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const app = await getApp();
  const deals = await app.container.router.crm.listDeals(businessId);
  return NextResponse.json({ deals });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || typeof body.title !== "string") {
    return NextResponse.json({ error: "businessId and title are required" }, { status: 400 });
  }
  const app = await getApp();
  const result = await app.container.router.crm.createDeal({
    businessId: body.businessId,
    contactId: body.contactId || undefined,
    title: body.title,
    amount: typeof body.amount === "number" ? body.amount : undefined,
  });
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string" || typeof body.stage !== "string") {
    return NextResponse.json({ error: "id and stage are required" }, { status: 400 });
  }
  const app = await getApp();
  const result = await app.container.router.crm.updateDealStage(body.id, body.stage);
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const app = await getApp();
  await app.container.router.crm.deleteDeal(id);
  return NextResponse.json({ ok: true });
}
