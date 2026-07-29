import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string" || typeof body.channel !== "string") {
    return NextResponse.json({ error: "businessId and channel are required" }, { status: 400 });
  }

  const app = await getApp();
  const result = await app.container.router.channels.disconnect(body.businessId, body.channel);
  return NextResponse.json(result);
}
