import { NextRequest, NextResponse } from "next/server";

import { verifyAdminToken } from "@ai-chat-platform/client-auth";

import { getApp } from "../../../../lib/app";
import { swr } from "../../../../lib/swr-cache";

const ADMIN_COOKIE = "admin_session";
const CLIENT_COOKIE = "client_session";

export const dynamic = "force-dynamic";

/** Live system-map snapshot for the Control Plane panel. Admin-only.
 *  The snapshot runs live probes and regularly takes tens of seconds, so
 *  we serve the last good copy instantly and refresh in the background
 *  (`?fresh=1` awaits the live value for an explicit manual refresh). */
export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const load = () =>
    swr(
      "admin:system-map",
      45_000,
      async () => {
        const app = await getApp();
        return app.container.router.systemMap.snapshot();
      },
      fresh,
    );

  // First try admin_session (env admin fallback)
  const adminToken = req.cookies.get(ADMIN_COOKIE)?.value ?? "";
  if (verifyAdminToken(adminToken)) {
    try {
      return NextResponse.json((await load()) ?? { error: "warming up" });
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
      if (session?.isAdmin) {
        return NextResponse.json((await load()) ?? { error: "warming up" });
      }
    } catch {
      // treat as unauthorized below
    }
  }

  return NextResponse.json({ error: "Not authorized." }, { status: 401 });
}