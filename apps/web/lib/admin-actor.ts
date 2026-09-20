import { NextRequest } from "next/server";
import { verifyAdminToken } from "@ai-chat-platform/client-auth";

import { getApp } from "./app";

const CLIENT_COOKIE = "client_session";
const ADMIN_COOKIE = "admin_session";

/** Who's actually making this admin-surface request -- the fixed platform
 * admin login's real username (ADMIN_USERNAME), or a ClientAccount's own
 * username. Never the literal "admin": no login is named that, so
 * recording it told nobody who acted. Used only for attribution (audit
 * logs, Deleted Data), never for access control -- these routes are
 * already the open /api/admin/* surface. "unknown" only if neither
 * cookie resolves to anyone. */
export async function resolveAdminActor(req: NextRequest): Promise<string> {
  if (verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return process.env.ADMIN_USERNAME || "unknown";
  }

  const clientToken = req.cookies.get(CLIENT_COOKIE)?.value;
  if (clientToken) {
    const app = await getApp();
    const session = await app.container.router.clientAuth.getSession(clientToken);
    // Any valid client session gets its own username, admin or not --
    // this used to require session.isAdmin, so a shop owner/staff login
    // (e.g. "Fardin") fell through to the "admin" default below and every
    // change they made was recorded as "admin", a login nobody uses.
    if (session) return session.username;
  }

  return "unknown";
}

/** True only for a real platform admin (the fixed admin login, or a
 * ClientAccount flagged isAdmin) -- NOT for any valid session. The open
 * /api/admin/* surface accepts a shop owner's or staff member's session
 * too (see CLAUDE.md's known gap), so a route that must never reach a
 * client (e.g. the Deleted Data panel) has to check this itself. */
export async function isPlatformAdmin(req: NextRequest): Promise<boolean> {
  if (verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) return true;

  const clientToken = req.cookies.get(CLIENT_COOKIE)?.value;
  if (clientToken) {
    const app = await getApp();
    const session = await app.container.router.clientAuth.getSession(clientToken);
    return Boolean(session?.isAdmin);
  }
  return false;
}
