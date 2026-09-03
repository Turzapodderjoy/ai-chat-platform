import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@ai-chat-platform/client-auth";

import { getApp } from "../../../../lib/app";

const CLIENT_COOKIE = "client_session";
const ADMIN_COOKIE = "admin_session";

// Never cached anywhere (browser, CDN/tunnel edge) — this is per-session
// identity and permissions, so a stale response would show panels an
// admin just restricted as still visible until the cache happened to expire.
export const dynamic = "force-dynamic";

function json(body: unknown) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

/** Tells the client dashboard whether the current viewer is the admin
 * (browsing in from the mother dashboard — gets the "back to Command
 * Center" link) or a real client session (does not). Also carries the
 * username so the dashboard can show who's logged in. */
export async function GET(req: NextRequest) {
  if (verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return json({ role: "admin", username: "admin" });
  }

  const clientToken = req.cookies.get(CLIENT_COOKIE)?.value;
  if (clientToken) {
    const app = await getApp();
    const session = await app.container.router.clientAuth.getSession(clientToken);
    if (session) {
      if (session.isAdmin) {
        return json({ role: "admin", username: session.username });
      }
      return json({
        role: session.isAgent ? "agent" : "client",
        accountRole: session.role,
        businessId: session.businessId,
        allowedPanels: session.allowedPanels,
        username: session.username,
        accountId: session.id,
      });
    }
  }

  return json({ role: null });
}
