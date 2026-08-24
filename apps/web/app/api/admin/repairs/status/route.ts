import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string" || typeof body.status !== "string") {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }

  const app = await getApp();
  const result = await app.container.router.repairs.updateStatus(body.id, body.status);
  return NextResponse.json(result);
}
