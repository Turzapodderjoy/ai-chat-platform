import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { resolveClientSession } from "../../../../../lib/client-session";

/** Internal notes on a chat -- never sent to the customer, visible to
 * the whole handoff team (owner + every agent), not just whoever it's
 * assigned to. Same ownership check as the rest of /api/client/inbox:
 * businessId always resolved from the session, never trusted from the
 * request. */
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

  const notes = await app.container.router.handoff.listNotes(sessionId);
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const session = await resolveClientSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.sessionId !== "string" || typeof body.body !== "string") {
    return NextResponse.json({ error: "sessionId and body are required" }, { status: 400 });
  }

  const app = await getApp();
  const meta = await app.container.router.handoff.getConversationMeta(body.sessionId);
  if (!meta || meta.businessId !== session.businessId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    // Author is resolved from the caller's own session (their username),
    // never taken from the request body.
    const note = await app.container.router.handoff.addNote({
      conversationId: body.sessionId,
      author: session.username,
      body: body.body,
    });
    return NextResponse.json(note);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await resolveClientSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const app = await getApp();
  const note = await app.container.router.handoff.getNote(id);
  if (!note || note.businessId !== session.businessId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await app.container.router.handoff.deleteNote(id);
  return NextResponse.json({ ok: true });
}
