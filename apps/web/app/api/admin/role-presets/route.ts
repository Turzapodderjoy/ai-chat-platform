import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const presets = await app.container.router.clientAuth.listRolePresets(businessId);
  return NextResponse.json(presets);
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || (body.role !== "owner" && body.role !== "staff")) {
    return NextResponse.json({ error: "businessId and role (owner/staff) are required" }, { status: 400 });
  }

  const panels =
    body.allowedPanels === null
      ? null
      : Array.isArray(body.allowedPanels)
        ? body.allowedPanels.filter((p: unknown): p is string => typeof p === "string")
        : null;

  try {
    const app = await getApp();
    await app.container.router.clientAuth.setRolePreset(body.businessId, body.role, panels);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
