import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

// The Invoices panel's "Paid" action -- one amount that becomes the
// invoice's real total and marks it fully collected (see
// PaymentService.setFinalAmount's own comment for why this replaces
// prior payment rows instead of adding to them). When the invoice was
// generated from a repair order, the order's own total is overridden to
// match too, so Order Management doesn't show a stale itemized sum next
// to an invoice that's since been marked paid at a different amount --
// orchestrated here rather than inside either service so
// revenue/repairs stay decoupled from each other.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.businessId !== "string" ||
    typeof body.invoiceId !== "string" ||
    typeof body.amount !== "number"
  ) {
    return NextResponse.json({ error: "businessId, invoiceId, and amount are required" }, { status: 400 });
  }
  const app = await getApp();
  const { repairAppointmentId } = await app.container.router.revenue.setInvoicePaidAmount(
    body.invoiceId,
    body.businessId,
    body.amount
  );
  if (repairAppointmentId) {
    await app.container.router.repairs.setOrderTotalOverride(repairAppointmentId, body.amount);
  }
  return NextResponse.json({ ok: true });
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
