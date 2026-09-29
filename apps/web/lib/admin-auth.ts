import { NextRequest } from "next/server";

import { prisma } from "@ai-chat-platform/database";
import { verifyAdminToken } from "@ai-chat-platform/client-auth";

const ADMIN_COOKIE = "admin_session";
const CLIENT_COOKIE = "client_session";

// One true definition of "admin request" — the same one /api/admin middleware
// uses: EITHER the fixed env-admin session cookie (stateless token) OR a live,
// non-disabled ClientAccount with isAdmin (the Admin Users panel admins, who
// authenticate with client_session). Platform routes that expose internals
// (agent API keys, ops ledger, sign-in/sign-out) MUST check this instead of
// verifyAdminToken alone — the token-only check locks out panel-managed
// admins, which is exactly why the IT Guy and model picker 401'd for them.
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  if (verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) return true;
  const token = req.cookies.get(CLIENT_COOKIE)?.value;
  if (!token) return false;
  const session = await prisma.clientSession.findUnique({
    where: { token },
    include: { account: true },
  });
  return !!(
    session &&
    session.expiresAt > new Date() &&
    !session.account.disabled &&
    session.account.isAdmin
  );
}