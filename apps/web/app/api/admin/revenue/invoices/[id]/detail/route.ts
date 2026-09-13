import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../../lib/app";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getApp();
  const detail = await app.container.router.revenue.getInvoiceDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}
