import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";
import { isAdminRequest } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

/** The Control Room's agent roster, for the panel's context line. */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const app = await getApp();
  return NextResponse.json({ agents: await app.container.router.hermesControl.agents() });
}

/** One admin message to the Hermes Control Room. Admin-only (proxied). */
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { message?: string; mode?: "control" | "itguy" };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const mode = body.mode === "itguy" ? "itguy" : "control";

  // A stable per-login session key so the admin's thread with Hermes keeps
  // its memory across turns without anything DB-side. DB admins carry
  // client_session (not admin_session), so fall back to that for them.
  const adminRaw = req.cookies.get("admin_session")?.value ?? "";
  const clientRaw = req.cookies.get("client_session")?.value ?? "";
  const sessionKey = (adminRaw || clientRaw).replace(/[^a-zA-Z0-9-_.]/g, "").slice(0, 32) || "console";

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