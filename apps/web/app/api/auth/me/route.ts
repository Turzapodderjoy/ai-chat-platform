import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@ai-chat-platform/client-auth";

import { getApp } from "../../../../lib/app";

const CLIENT_COOKIE = "client_session";
const ADMIN_COOKIE = "admin_session";

/** Tells the client dashboard whether the current viewer is the admin
 * (browsing in from the mother dashboard — gets the "back to Command
 * Center" link) or a real client session (does not). Also carries the
 * username so the dashboard can show who's logged in. */
export async function GET(req: NextRequest) {
  if (verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ role: "admin", username: "admin" });
  }

  const clientToken = req.cookies.get(CLIENT_COOKIE)?.value;
  if (clientToken) {
    const app = await getApp();
    const session = await app.container.router.clientAuth.getSession(clientToken);
    if (session) {
      if (session.isAdmin) {
        return NextResponse.json({ role: "admin", username: session.username });
      }
      return NextResponse.json({
        role: session.isAgent ? "agent" : "client",
        businessId: session.businessId,
        allowedPanels: session.allowedPanels,
        username: session.username,
        accountId: session.id,
      });
    }
  }

  return NextResponse.json({ role: null });
}
