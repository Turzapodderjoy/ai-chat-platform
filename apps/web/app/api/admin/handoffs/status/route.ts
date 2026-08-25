import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

const VALID = new Set(["bot", "pending", "human"]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.sessionId !== "string" || typeof body.status !== "string" || !VALID.has(body.status)) {
    return NextResponse.json({ error: "sessionId and a valid status (bot/pending/human) are required" }, { status: 400 });
  }

  const app = await getApp();
  const result = await app.container.router.handoff.setStatus(body.sessionId, body.status);
  return NextResponse.json(result);
}
