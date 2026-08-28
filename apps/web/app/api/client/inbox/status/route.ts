import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { resolveClientSession } from "../../../../../lib/client-session";

const VALID = new Set(["bot", "pending", "human"]);

/** Same ownership rule as reply/route.ts -- owner unrestricted, agent
 * only on their own assigned chat. */
export async function POST(req: NextRequest) {
  const session = await resolveClientSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.sessionId !== "string" || typeof body.status !== "string" || !VALID.has(body.status)) {
    return NextResponse.json({ error: "sessionId and a valid status (bot/pending/human) are required" }, { status: 400 });
  }

  const app = await getApp();
  const meta = await app.container.router.handoff.getConversationMeta(body.sessionId);
  if (!meta || meta.businessId !== session.businessId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (session.isAgent && meta.assignedAgentId !== session.id) {
    return NextResponse.json({ error: "This chat isn't assigned to you." }, { status: 403 });
  }

  const result = await app.container.router.handoff.setStatus(body.sessionId, body.status as "bot" | "pending" | "human");
  return NextResponse.json(result);
}
