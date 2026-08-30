import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => null);

  const app = await getApp();
  const appointment = await app.container.router.repairs.findByToken(params.token);
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const reason = body?.reason || null;
  const updated = await app.container.router.repairs.requestCancel(appointment.id, reason);
  await app.container.router.conversations.addMessage(params.token, "system", `Cancellation requested${reason ? `: ${reason}` : ""}`);

  return NextResponse.json({ ok: true, appointment: updated });
}
