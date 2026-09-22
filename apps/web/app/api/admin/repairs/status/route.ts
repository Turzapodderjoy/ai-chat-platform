import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { resolveAdminActor } from "../../../../../lib/admin-actor";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const app = await getApp();
  const actorUsername = await resolveAdminActor(req);

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
    // Popup edits ride along with the status change ("Mark Received").
    if (typeof body.details === "object" && body.details !== null) {
      const d = body.details as Record<string, unknown>;
      await app.container.router.repairs.updateRepairDetails(body.id, {
        customerName: typeof d.customerName === "string" ? d.customerName : undefined,
        phone: typeof d.phone === "string" ? d.phone : undefined,
        email: typeof d.email === "string" ? d.email : undefined,
        deviceType: typeof d.deviceType === "string" ? d.deviceType : undefined,
        deviceModel: typeof d.deviceModel === "string" ? d.deviceModel : undefined,
        issueDescription: typeof d.issueDescription === "string" ? d.issueDescription : undefined,
        totalOverride: typeof d.totalOverride === "number" ? d.totalOverride : undefined,
      }, actorUsername);
    }
    const result = await app.container.router.repairs.updateStatus(body.id, body.status, actorUsername);
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
