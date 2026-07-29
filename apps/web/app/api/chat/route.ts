import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../lib/app";

// The website embed widget (public/widget.js) runs on a CLIENT's own
// site — a different origin from wherever this app is deployed — so
// this route needs CORS enabled or every embedded widget would fail
// silently on the first fetch. Wide open (`*`) is fine here: this
// endpoint takes no cookies/credentials, and the businessId in the body
// is public info already baked into the embed snippet itself.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.message !== "string" || body.message.trim() === "") {
    return NextResponse.json({ error: "message is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "dev-session";
  const businessId = typeof body.businessId === "string" ? body.businessId : undefined;

  try {
    const app = await getApp();
    const answer = await app.container.router.chat.post(sessionId, body.message, businessId);
    return NextResponse.json(answer, { headers: CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Chat failed.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503, headers: CORS_HEADERS }
    );
  }
}
