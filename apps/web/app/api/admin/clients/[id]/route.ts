import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  if (!body || typeof body.maxAgents !== "number") {
    return NextResponse.json({ error: "maxAgents (number) is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    await app.container.router.clientAuth.setMaxAgents(id, body.maxAgents);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const app = await getApp();
    const result = await app.container.router.admin.deleteClient(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
