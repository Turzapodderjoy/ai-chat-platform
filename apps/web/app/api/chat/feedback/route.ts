import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

// Same reasoning as /api/chat's CORS headers — the Chat Demo tab is the
// only real caller today, but this stays consistent with the rest of
// the chat surface rather than silently diverging.
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

  if (
    !body ||
    typeof body.messageId !== "string" ||
    typeof body.businessId !== "string" ||
    typeof body.verdict !== "string"
  ) {
    return NextResponse.json(
      { error: "messageId, businessId, and verdict are required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const app = await getApp();
    const result = await app.container.router.feedback.submit(
      body.messageId,
      body.businessId,
      body.verdict,
      typeof body.note === "string" ? body.note : undefined
    );
    return NextResponse.json(result, { headers: CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400, headers: CORS_HEADERS }
    );
  }
}
