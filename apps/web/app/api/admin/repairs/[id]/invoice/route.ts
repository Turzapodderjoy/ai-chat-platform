import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../lib/app";
import { resolveAdminActor } from "../../../../../../lib/admin-actor";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const app = await getApp();
    const actorUsername = await resolveAdminActor(req);
    const invoice = await app.container.router.repairs.generateInvoice(id, actorUsername);
    return NextResponse.json(invoice);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
