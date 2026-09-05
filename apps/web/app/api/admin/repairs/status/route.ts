import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const app = await getApp();

  // Handle priority update
  if (body.priority && typeof body.priority === "string") {
    await app.container.router.repairs.updatePriority(body.id, body.priority);
  }

  // Handle appointment date update (reschedule)
  if (body.appointmentDate && typeof body.appointmentDate === "string") {
    await app.container.router.repairs.updateDate(body.id, body.appointmentDate);
  }

  // Handle status update
  if (body.status && typeof body.status === "string") {
    const result = await app.container.router.repairs.updateStatus(body.id, body.status);
    return NextResponse.json(result);
  }

  // Handle technician assignment
  if ("technicianId" in body) {
    const tid = body.technicianId === "" || body.technicianId === null ? null : body.technicianId;
    const result = await app.container.router.repairs.assignTechnician(body.id, tid);
    return NextResponse.json(result);
  }

  return NextResponse.json({ ok: true });
}
