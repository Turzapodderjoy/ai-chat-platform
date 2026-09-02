import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.repairAppointmentId !== "string" ||
    (body.kind !== "part" && body.kind !== "service") ||
    typeof body.name !== "string" ||
    typeof body.quantity !== "number" ||
    typeof body.defaultPrice !== "number"
  ) {
    return NextResponse.json(
      { error: "repairAppointmentId, kind (part/service), name, quantity, and defaultPrice are required" },
      { status: 400 }
    );
  }

  try {
    const app = await getApp();
    const item = await app.container.router.repairs.addOrderItem(body.repairAppointmentId, {
      productId: typeof body.productId === "string" ? body.productId : undefined,
      kind: body.kind,
      name: body.name,
      quantity: body.quantity,
      defaultPrice: body.defaultPrice,
    });
    return NextResponse.json(item);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const item = await app.container.router.repairs.updateOrderItemPrice(
      body.id,
      typeof body.overridePrice === "number" ? body.overridePrice : null
    );
    return NextResponse.json(item);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    await app.container.router.repairs.removeOrderItem(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
