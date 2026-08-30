import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/** RBAC hierarchy (Day 1 AM) -- org/department/team layer on top of the
 * existing role + per-panel allow-list system. Same open /api/admin/*
 * pattern as the rest of Client Access (businessId taken from the
 * query/body, no auth check beyond the mother dashboard's own gate). */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const teams = await app.container.router.clientAuth.listTeams(businessId);
  return NextResponse.json({ teams });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: "businessId and name are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const team = await app.container.router.clientAuth.createTeam(
      body.businessId,
      body.name,
      typeof body.parentTeamId === "string" ? body.parentTeamId : null
    );
    return NextResponse.json(team);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const app = await getApp();

  if (body.defaultAllowedPanels !== undefined) {
    const panels = Array.isArray(body.defaultAllowedPanels)
      ? body.defaultAllowedPanels.filter((p: unknown): p is string => typeof p === "string")
      : null;
    await app.container.router.clientAuth.setTeamDefaultPanels(body.id, panels);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const app = await getApp();
  await app.container.router.clientAuth.deleteTeam(id);
  return NextResponse.json({ ok: true });
}
