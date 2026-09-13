import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../../lib/app";

// The Invoices panel's explicit "Send" button -- emails the invoice PDF
// to the customer. Never fired automatically (not on print, not on
// marking paid) per the project owner: only this button triggers it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getApp();
  const result = await app.container.router.revenue.sendInvoiceEmail(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to send" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
