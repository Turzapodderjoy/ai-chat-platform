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
    const answer = await withTimeout(
      app.container.router.chat.post(sessionId, body.message, businessId),
      45_000
    );
    return NextResponse.json(answer, { headers: CORS_HEADERS });
  } catch (err) {
    // 45s, not the old 12s: retrieval alone has taken up to ~12s under
    // load, and a single AI provider can legitimately take 8-9s even when
    // healthy — 12s left almost no room and was firing on completely
    // normal, slow-but-successful replies, returning this canned message
    // to the customer while the real answer kept computing in the
    // background and got saved with nobody left listening for it (the
    // widget had already shown this error and moved on). 45s comfortably
    // covers one provider timing out (see ai-manager's PROVIDER_TIMEOUT_MS)
    // and rotating to a second healthy one. Still bounded — a genuinely
    // dead backend (DB down, every provider unreachable) must never hang
    // the customer's widget forever. Log the real error for us to see,
    // but the customer gets a normal-looking reply instead of a broken
    // error state — same shape ChatResponse always returns, so the
    // widget needs no special-case handling for this.
    console.error("Chat request failed or timed out:", err);
    return NextResponse.json(
      {
        answer: "We're having trouble connecting right now — a team member will follow up with you shortly.",
        provider: "system",
        tokens: 0,
        confidence: 0,
        handoff: true,
      },
      { headers: CORS_HEADERS }
    );
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)),
  ]);
}
