import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.businessId !== "string" ||
    typeof body.invoiceId !== "string" ||
    typeof body.amount !== "number" ||
    typeof body.method !== "string"
  ) {
    return NextResponse.json({ error: "businessId, invoiceId, amount, and method are required" }, { status: 400 });
  }
  const app = await getApp();
  const result = await app.container.router.revenue.recordPayment({
    businessId: body.businessId,
    invoiceId: body.invoiceId,
    amount: body.amount,
    method: body.method,
    note: body.note || undefined,
  });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const app = await getApp();
  await app.container.router.revenue.deletePayment(id);
  return NextResponse.json({ ok: true });
}
