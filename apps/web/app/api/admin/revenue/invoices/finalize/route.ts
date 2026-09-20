import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../lib/app";
import { resolveAdminActor } from "../../../../../../lib/admin-actor";

/** "Finalize" on an invoice row: the shortfall between the total and what
 * the customer actually paid becomes a recorded discount and the invoice
 * is closed as paid (see InvoiceService.finalizeWithDiscount). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  try {
    const app = await getApp();
    const invoice = await app.container.router.revenue.finalizeInvoice(body.id, await resolveAdminActor(req));
    // Keep the linked order's total in step, same as the Paid/Total edit route does.
    if (invoice.repairAppointmentId) {
      await app.container.router.repairs.setOrderTotalOverride(invoice.repairAppointmentId, invoice.total);
    }
    return NextResponse.json(invoice);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
