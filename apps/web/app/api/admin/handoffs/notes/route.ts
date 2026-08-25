import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }
  const app = await getApp();
  const notes = await app.container.router.handoff.listNotes(conversationId);
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.conversationId !== "string" || typeof body.body !== "string") {
    return NextResponse.json({ error: "conversationId and body are required" }, { status: 400 });
  }
  try {
    const app = await getApp();
    const note = await app.container.router.handoff.addNote({
      conversationId: body.conversationId,
      author: typeof body.author === "string" && body.author.trim() ? body.author : "admin",
      body: body.body,
    });
    return NextResponse.json(note);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const app = await getApp();
  await app.container.router.handoff.deleteNote(id);
  return NextResponse.json({ ok: true });
}
