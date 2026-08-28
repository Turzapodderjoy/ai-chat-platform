import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";
import { resolveClientSession } from "../../../../lib/client-session";

/** Toggles the CALLER's own online/offline status -- always self, never
 * takes an accountId from the body, so one agent can't flip another's
 * presence. */
export async function POST(req: NextRequest) {
  const session = await resolveClientSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.online !== "boolean") {
    return NextResponse.json({ error: "online (boolean) is required" }, { status: 400 });
  }

  const app = await getApp();
  await app.container.router.clientAuth.setOnline(session.id, body.online);
  return NextResponse.json({ ok: true });
}
