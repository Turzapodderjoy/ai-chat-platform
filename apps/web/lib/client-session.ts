import { NextRequest } from "next/server";

import { getApp } from "./app";

const CLIENT_COOKIE = "client_session";

export interface ClientScopedSession {
  id: string;
  businessId: string;
  isAgent: boolean;
  username: string;
}

/** Resolves the caller's own {accountId, businessId, isAgent} from the
 * client_session cookie -- used by every /api/client/* route so a
 * businessId is NEVER taken from the request body/query (that would let
 * one client's login read or act on another business's data). Admin
 * sessions and admin-flagged accounts are rejected here too -- these
 * routes are the owner/agent surface, admin already has its own
 * unrestricted /api/admin/* routes. */
export async function resolveClientSession(req: NextRequest): Promise<ClientScopedSession | null> {
  const token = req.cookies.get(CLIENT_COOKIE)?.value;
  if (!token) return null;

  const app = await getApp();
  const session = await app.container.router.clientAuth.getSession(token);
  if (!session || session.isAdmin || !session.businessId) return null;

  return { id: session.id, businessId: session.businessId, isAgent: session.isAgent, username: session.username };
}
