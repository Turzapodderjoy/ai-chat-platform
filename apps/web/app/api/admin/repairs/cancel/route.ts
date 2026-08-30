import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string" || typeof body.action !== "string") {
    return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  }

  const app = await getApp();

  if (body.action === "approve") {
    const result = await app.container.router.repairs.approveCancel(body.id);
    return NextResponse.json(result);
  }

  if (body.action === "reject") {
    const result = await app.container.router.repairs.rejectCancel(body.id);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
}
