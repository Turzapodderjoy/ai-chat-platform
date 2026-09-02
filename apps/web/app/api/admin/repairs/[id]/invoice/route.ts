import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../lib/app";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const app = await getApp();
    const invoice = await app.container.router.repairs.generateInvoice(id);
    return NextResponse.json(invoice);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
