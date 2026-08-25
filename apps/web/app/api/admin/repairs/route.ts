import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/** Repairs panel's data source — businessId omitted returns every
 * business's appointments, same "unscoped means platform-wide"
 * convention as /api/admin/conversations. */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;

  const app = await getApp();
  const result = await app.container.router.repairs.listForBusiness(businessId);
  return NextResponse.json({ appointments: result });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const app = await getApp();
  const result = await app.container.router.repairs.deleteAppointment(id);
  return NextResponse.json(result);
}
