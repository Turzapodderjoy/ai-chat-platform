import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ai-chat-platform/database";

// Only the per-client dashboards are gated — the mother dashboard
// (/dashboard exactly) stays open, matching this app's existing
// documented no-auth stance there (see CLAUDE.md). This is the one
// route the user asked to actually be protected by the new client
// login system. Session is validated against the DB (not a signed
// stateless cookie) on every request, so a client disabled from the
// mother dashboard's Client Access panel is locked out immediately —
// not just after their cookie happens to expire.
export const config = {
  matcher: ["/dashboard/:businessId/:path*"],
};

const COOKIE_NAME = "client_session";

export async function proxy(req: NextRequest) {
  const businessId = req.nextUrl.pathname.split("/")[2];
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!businessId || !token) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const session = await prisma.clientSession.findUnique({
    where: { token },
    include: { account: true },
  });

  const valid =
    session &&
    session.expiresAt > new Date() &&
    !session.account.disabled &&
    session.account.businessId === businessId;

  if (!valid) {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  return NextResponse.next();
}
