import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.businessId !== "string" ||
    typeof body.customerName !== "string" ||
    typeof body.phone !== "string" ||
    typeof body.deviceType !== "string" ||
    typeof body.issueDescription !== "string"
  ) {
    return NextResponse.json(
      { error: "businessId, customerName, phone, deviceType, and issueDescription are required" },
      { status: 400 }
    );
  }

  try {
    const app = await getApp();
    const appointment = await app.container.router.repairs.createOrderEntry({
      businessId: body.businessId,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      customerName: body.customerName,
      phone: body.phone,
      email: typeof body.email === "string" ? body.email : undefined,
      deviceType: body.deviceType,
      deviceModel: typeof body.deviceModel === "string" ? body.deviceModel : undefined,
      issueDescription: body.issueDescription,
    });
    return NextResponse.json(appointment);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
