import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

// Deliberately separate from /api/chat (the public embed-widget endpoint,
// open CORS, no isTraining concept) rather than a body flag on the shared
// route — an admin-only dashboard tool has no reason to share an attack
// surface with a route embedded on arbitrary third-party sites.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.message !== "string" || body.message.trim() === "") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "dev-session";
  const businessId = typeof body.businessId === "string" ? body.businessId : undefined;

  try {
    const app = await getApp();
    const answer = await app.container.router.chat.post(sessionId, body.message, businessId, true);
    return NextResponse.json(answer);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Chat failed.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }
}
