import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { resolveClientSession } from "../../../../../lib/client-session";

/** Owner can reply to any chat in their business; an agent can ONLY
 * reply to chats assigned to them -- that's the actual enforcement
 * point for "agents see teammates' chats read-only." */
export async function POST(req: NextRequest) {
  const session = await resolveClientSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.sessionId !== "string" || typeof body.message !== "string") {
    return NextResponse.json({ error: "sessionId and message are required" }, { status: 400 });
  }

  const app = await getApp();
  const meta = await app.container.router.handoff.getConversationMeta(body.sessionId);
  if (!meta || meta.businessId !== session.businessId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (session.isAgent && meta.assignedAgentId !== session.id) {
    return NextResponse.json({ error: "This chat isn't assigned to you." }, { status: 403 });
  }

  try {
    const result = await app.container.router.handoff.reply(body.sessionId, body.message);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
