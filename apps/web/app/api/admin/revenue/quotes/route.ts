import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const app = await getApp();
  const contactId = req.nextUrl.searchParams.get("contactId");
  if (contactId) {
    const quotes = await app.container.router.revenue.listQuotesForContact(contactId);
    return NextResponse.json({ quotes });
  }
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const quotes = await app.container.router.revenue.listQuotes(businessId);
  return NextResponse.json({ quotes });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || typeof body.title !== "string" || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "businessId, title, and at least one line item are required" }, { status: 400 });
  }
  const app = await getApp();
  const result = await app.container.router.revenue.createQuote({
    businessId: body.businessId,
    contactId: body.contactId || undefined,
    title: body.title,
    items: body.items.map((i: { name: string; quantity: number; unitPrice: number }) => ({
      name: i.name,
      quantity: Number(i.quantity) || 1,
      unitPrice: Number(i.unitPrice) || 0,
    })),
    discount: typeof body.discount === "number" ? body.discount : undefined,
    tax: typeof body.tax === "number" ? body.tax : undefined,
    notes: body.notes || undefined,
    expiresAt: body.expiresAt || undefined,
  });
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string" || typeof body.status !== "string") {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }
  const app = await getApp();
  const result = await app.container.router.revenue.updateQuoteStatus(body.id, body.status);
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const app = await getApp();
  await app.container.router.revenue.deleteQuote(id);
  return NextResponse.json({ ok: true });
}
