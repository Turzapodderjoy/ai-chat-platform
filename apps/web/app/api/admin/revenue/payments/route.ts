import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { resolveAdminActor } from "../../../../../lib/admin-actor";

// Backs the Invoices panel's directly-editable Total/Paid/Due cells --
// `total` and `amount` (paid) are independent, either or both may be
// given (see PaymentService.setAmounts's own comment for why a given
// `amount` replaces prior payment rows instead of adding to them). When
// the invoice was generated from a repair order, the order's own total
// is overridden to match too, so Order Management doesn't show a stale
// itemized sum next to an invoice whose total/paid has since been
// edited -- orchestrated here rather than inside either service so
// revenue/repairs stay decoupled from each other.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.businessId !== "string" ||
    typeof body.invoiceId !== "string" ||
    (typeof body.total !== "number" && typeof body.amount !== "number")
  ) {
    return NextResponse.json({ error: "businessId, invoiceId, and total and/or amount are required" }, { status: 400 });
  }
  const app = await getApp();
  const actorUsername = await resolveAdminActor(req);
  const { repairAppointmentId } = await app.container.router.revenue.setInvoiceAmounts(body.invoiceId, body.businessId, {
    total: typeof body.total === "number" ? body.total : undefined,
    paidAmount: typeof body.amount === "number" ? body.amount : undefined,
  }, actorUsername);
  if (repairAppointmentId) {
    const invoice = await app.container.router.revenue.getInvoice(body.invoiceId);
    if (invoice) await app.container.router.repairs.setOrderTotalOverride(repairAppointmentId, invoice.total);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const app = await getApp();
  const actorUsername = await resolveAdminActor(req);
  await app.container.router.revenue.deletePayment(id, actorUsername);
  return NextResponse.json({ ok: true });
}
