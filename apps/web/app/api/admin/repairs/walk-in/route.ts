import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { resolveAdminActor } from "../../../../../lib/admin-actor";

const PRIORITIES = ["low", "normal", "high", "urgent"];

// Staff-entered walk-in from the Repairs panel's Walk-in popup.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const required = ["businessId", "customerName", "phone", "deviceType", "issueDescription"];
  const missing = body ? required.filter((k) => typeof body[k] !== "string" || body[k].trim() === "") : required;
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing/invalid: ${missing.join(", ")}` }, { status: 400 });
  }
  if (body.priority && !PRIORITIES.includes(body.priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const appointment = await app.container.router.repairs.bookWalkIn(
      {
        businessId: body.businessId,
        customerName: body.customerName.trim(),
        phone: body.phone.trim(),
        email: typeof body.email === "string" && body.email.trim() ? body.email.trim() : undefined,
        deviceType: body.deviceType.trim(),
        deviceModel: typeof body.deviceModel === "string" && body.deviceModel.trim() ? body.deviceModel.trim() : undefined,
        issueDescription: body.issueDescription.trim(),
        wantsFreeDiagnosis: body.wantsFreeDiagnosis === true,
        technicianId: typeof body.technicianId === "string" && body.technicianId ? body.technicianId : undefined,
        priority: typeof body.priority === "string" && body.priority ? body.priority : undefined,
      },
      await resolveAdminActor(req)
    );
    return NextResponse.json(appointment);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
