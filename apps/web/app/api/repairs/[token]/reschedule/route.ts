import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);

  if (!body || !body.newDate) {
    return NextResponse.json({ error: "newDate is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const app = await getApp();
  const appointment = await app.container.router.repairs.findByToken(token);
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404, headers: CORS_HEADERS });
  }

  const updated = await app.container.router.repairs.requestReschedule(appointment.id, body.newDate);

  return NextResponse.json({ ok: true, appointment: updated }, { headers: CORS_HEADERS });
}
