import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);

  if (!body || !body.newDate) {
    return NextResponse.json({ error: "newDate is required" }, { status: 400 });
  }

  const app = await getApp();
  const appointment = await app.container.router.repairs.findByToken(token);
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const updated = await app.container.router.repairs.requestReschedule(appointment.id, body.newDate);

  return NextResponse.json({ ok: true, appointment: updated });
}
