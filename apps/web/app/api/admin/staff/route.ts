import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") || undefined;
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const staff = await app.container.router.repairs.listStaff(businessId);
  return NextResponse.json({ staff });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: "businessId and name are required" }, { status: 400 });
  }

  const app = await getApp();
  const member = await app.container.router.repairs.createStaff({
    businessId: body.businessId,
    name: body.name,
    email: body.email,
    phone: body.phone,
    role: body.role,
  });
  return NextResponse.json(member);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const app = await getApp();
  const { id, ...data } = body;
  const member = await app.container.router.repairs.updateStaff(id, data);
  return NextResponse.json(member);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const app = await getApp();
  await app.container.router.repairs.deleteStaff(id);
  return NextResponse.json({ ok: true });
}
