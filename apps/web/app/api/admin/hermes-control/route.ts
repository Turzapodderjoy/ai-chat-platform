import { NextRequest, NextResponse } from "next/server";

import { verifyAdminToken } from "@ai-chat-platform/client-auth";

import { getApp } from "../../../../lib/app";

const ADMIN_COOKIE = "admin_session";

export const dynamic = "force-dynamic";

/** The Control Room's agent roster, for the panel's context line. */
export async function GET() {
  const app = await getApp();
  return NextResponse.json({ agents: await app.container.router.hermesControl.agents() });
}

/** One admin message to the Hermes Control Room. Admin-only (proxied). */
export async function POST(req: NextRequest) {
  const rawCookie = req.cookies.get(ADMIN_COOKIE)?.value ?? "";
  if (!verifyAdminToken(rawCookie)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { message?: string; mode?: "control" | "itguy" };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const mode = body.mode === "itguy" ? "itguy" : "control";

  // A stable per-login session key so the admin's thread with Hermes keeps
  // its memory across turns without anything DB-side.
  const sessionKey = rawCookie.replace(/[^a-zA-Z0-9-_.]/g, "").slice(0, 32) || "console";

  try {
    const app = await getApp();
    const result = await app.container.router.hermesControl.turn(sessionKey, message, mode);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}