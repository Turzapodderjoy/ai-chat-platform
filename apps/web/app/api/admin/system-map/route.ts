import { NextRequest, NextResponse } from "next/server";

import { verifyAdminToken } from "@ai-chat-platform/client-auth";

import { getApp } from "../../../../lib/app";

const ADMIN_COOKIE = "admin_session";

export const dynamic = "force-dynamic";

/** Live system-map snapshot for the Control Plane panel. Admin-only. */
export async function GET(req: NextRequest) {
  const rawCookie = req.cookies.get(ADMIN_COOKIE)?.value ?? "";
  if (!verifyAdminToken(rawCookie)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const app = await getApp();
    const snapshot = await app.container.router.systemMap.snapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}