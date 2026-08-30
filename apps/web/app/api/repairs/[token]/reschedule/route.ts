import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => null);

  if (!body || !body.newDate) {
    return NextResponse.json({ error: "newDate is required" }, { status: 400 });
  }

  const app = await getApp();
  const appointment = await app.container.router.repairs.findByToken(params.token);
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const updated = await app.container.router.repairs.requestReschedule(appointment.id, body.newDate);
  await app.container.router.conversations.addMessage(params.token, "system", `Reschedule requested to ${new Date(body.newDate).toLocaleString()}`);

  return NextResponse.json({ ok: true, appointment: updated });
}
