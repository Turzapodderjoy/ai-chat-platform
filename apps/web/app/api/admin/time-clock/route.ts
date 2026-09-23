import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";
import { resolveAdminActor } from "../../../../lib/admin-actor";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }
  const staffId = req.nextUrl.searchParams.get("staffId") || undefined;
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;

  const app = await getApp();
  const entries = await app.container.router.repairs.listTimeEntries(businessId, staffId, from, to);
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || typeof body.staffId !== "string") {
    return NextResponse.json({ error: "businessId and staffId are required" }, { status: 400 });
  }
  const action = body.action as "in" | "out" | undefined;
  if (!action || (action !== "in" && action !== "out")) {
    return NextResponse.json({ error: "action must be 'in' or 'out'" }, { status: 400 });
  }

  const app = await getApp();
  const actorUsername = await resolveAdminActor(req);

  let entry;
  if (action === "in") {
    entry = await app.container.router.repairs.clockIn(body.businessId, body.staffId, body.note);
  } else {
    entry = await app.container.router.repairs.clockOut(body.businessId, body.staffId, body.note);
  }
  return NextResponse.json(entry);
}