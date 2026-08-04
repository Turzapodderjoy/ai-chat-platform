import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.tagId !== "string") {
    return NextResponse.json({ error: "tagId is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    await app.container.router.tags.assignTag({
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      messageId: typeof body.messageId === "string" ? body.messageId : undefined,
      tagId: body.tagId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const tagId = params.get("tagId");

  if (!tagId) {
    return NextResponse.json({ error: "tagId is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    await app.container.router.tags.removeTag({
      conversationId: params.get("conversationId") ?? undefined,
      messageId: params.get("messageId") ?? undefined,
      tagId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
