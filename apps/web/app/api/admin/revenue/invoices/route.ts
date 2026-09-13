import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const app = await getApp();
  const contactId = req.nextUrl.searchParams.get("contactId");
  if (contactId) {
    const invoices = await app.container.router.revenue.listInvoicesForContact(contactId);
    return NextResponse.json({ invoices });
  }
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const invoices = await app.container.router.revenue.listInvoices(businessId);
  return NextResponse.json({ invoices });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const app = await getApp();

  if (typeof body.businessId !== "string" || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "businessId and at least one line item are required" }, { status: 400 });
  }
  const result = await app.container.router.revenue.createInvoice({
    businessId: body.businessId,
    contactId: body.contactId || undefined,
    items: body.items.map((i: { name: string; quantity: number; unitPrice: number }) => ({
      name: i.name,
      quantity: Number(i.quantity) || 1,
      unitPrice: Number(i.unitPrice) || 0,
    })),
    discount: typeof body.discount === "number" ? body.discount : undefined,
    tax: typeof body.tax === "number" ? body.tax : undefined,
    dueDate: body.dueDate || undefined,
  });
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const app = await getApp();

  // If only status is provided, use the existing updateInvoiceStatus --
  // "paid"/"partially_paid" are excluded here on purpose. Those two are
  // only ever set by PaymentService.reconcileInvoice (via the "Paid"
  // action's amount override, POST /api/admin/revenue/payments), which
  // keeps amountPaid in sync with the status. Allowing them here would
  // let a client set "paid" with no amount recorded at all.
  if (typeof body.status === "string" && Object.keys(body).length === 2) {
    if (body.status === "paid" || body.status === "partially_paid") {
      return NextResponse.json({ error: `Use the "Paid" action to record an amount instead of setting status "${body.status}" directly.` }, { status: 400 });
    }
    const result = await app.container.router.revenue.updateInvoiceStatus(body.id, body.status);
    return NextResponse.json(result);
  }

  // Otherwise, full update (items, discount, tax, contactId, dueDate)
  const result = await app.container.router.revenue.updateInvoice(body.id, {
    contactId: body.contactId ?? undefined,
    items: Array.isArray(body.items)
      ? body.items.map((i: { name: string; quantity: number; unitPrice: number }) => ({
          name: i.name,
          quantity: Number(i.quantity) || 1,
          unitPrice: Number(i.unitPrice) || 0,
        }))
      : undefined,
    discount: typeof body.discount === "number" ? body.discount : undefined,
    tax: typeof body.tax === "number" ? body.tax : undefined,
    dueDate: body.dueDate || undefined,
  });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const app = await getApp();
  await app.container.router.revenue.deleteInvoice(id);
  return NextResponse.json({ ok: true });
}
