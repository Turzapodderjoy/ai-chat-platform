import { NextRequest, NextResponse } from "next/server";

import { verifyAdminToken } from "@ai-chat-platform/client-auth";

import { getApp } from "../../../../lib/app";

const ADMIN_COOKIE = "admin_session";
const CLIENT_COOKIE = "client_session";

export const dynamic = "force-dynamic";

/** Live system-map snapshot for the Control Plane panel. Admin-only. */
export async function GET(req: NextRequest) {
  // First try admin_session (env admin fallback)
  const adminToken = req.cookies.get(ADMIN_COOKIE)?.value ?? "";
  if (verifyAdminToken(adminToken)) {
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

  // Fallback: check client_session for panel admin users
  const clientToken = req.cookies.get(CLIENT_COOKIE)?.value ?? "";
  if (clientToken) {
    try {
      const app = await getApp();
      const session = await app.container.router.clientAuth.getSession(clientToken);
      console.log('[system-map] session:', session ? { isAdmin: session.isAdmin, username: session.username } : 'null');
      if (session?.isAdmin) {
        console.log('[system-map] returning snapshot');
        const snapshot = await app.container.router.systemMap.snapshot();
        return NextResponse.json(snapshot);
      } else {
        console.log('[system-map] session found but not admin');
      }
    } catch (e) {
      console.log('[system-map] clientAuth.getSession error:', e);
    }
  } else {
    console.log('[system-map] no clientToken');
  }

  console.log('[system-map] returning Not authorized');
  return NextResponse.json({ error: "Not authorized." }, { status: 401 });
}