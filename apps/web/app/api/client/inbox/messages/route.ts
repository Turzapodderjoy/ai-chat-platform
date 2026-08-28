import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { resolveClientSession } from "../../../../../lib/client-session";

/** Owner and agent alike can READ any conversation in their own
 * business (agents see teammates' chats for coverage/context) -- only
 * reply/status below are restricted to the assigned agent. */
export async function GET(req: NextRequest) {
  const session = await resolveClientSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

  const app = await getApp();
  const meta = await app.container.router.handoff.getConversationMeta(sessionId);
  if (!meta || meta.businessId !== session.businessId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const messages = await app.container.router.handoff.messages(sessionId);
  return NextResponse.json({ messages });
}
