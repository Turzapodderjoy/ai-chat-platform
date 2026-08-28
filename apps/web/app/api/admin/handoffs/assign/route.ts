import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

/** Manual reassignment from the Inbox detail panel -- overrides
 * auto-assignment. agentId: null clears back to unassigned. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.sessionId !== "string") {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const agentId = typeof body.agentId === "string" ? body.agentId : null;

  const app = await getApp();
  const result = await app.container.router.handoff.setAssignedAgent(body.sessionId, agentId);
  return NextResponse.json(result);
}
