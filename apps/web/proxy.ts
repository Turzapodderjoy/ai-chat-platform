import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ai-chat-platform/database";
import { verifyAdminToken } from "@ai-chat-platform/client-auth";

// The mother dashboard itself ("/dashboard" exactly) is admin-only — no
// client session gets in there. "/dashboard/{businessId}/*" accepts
// either: an admin session (can browse into any client, same as before
// this feature existed) or a client session that matches that exact
// businessId. "/api/admin/**" accepts any authenticated session (admin or
// an active client account) — same-origin dashboard fetches send the
// session cookie automatically, so this closes the "anyone with the URL
// can hit admin APIs" hole while keeping client dashboards working.
// "Admin" here means either the single fixed admin_session cookie
// (stateless, nothing to invalidate early for it) OR a real ClientAccount
// with isAdmin set (DB-backed, validated on every request the same as a
// regular client session, so disabling one kicks it out immediately).
export const config = {
  matcher: ["/dashboard", "/dashboard/:businessId/:path*", "/api/admin/:path*"],
};

const CLIENT_COOKIE = "client_session";
const ADMIN_COOKIE = "admin_session";

export async function proxy(req: NextRequest) {
  const fixedAdmin = verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value);

  const clientToken = req.cookies.get(CLIENT_COOKIE)?.value;
  const session = clientToken
    ? await prisma.clientSession.findUnique({ where: { token: clientToken }, include: { account: true } })
    : null;
  const validSession = !!(session && session.expiresAt > new Date() && !session.account.disabled);
  const dbAdmin = validSession && session!.account.isAdmin;
  const isAdmin = fixedAdmin || dbAdmin;

  const pathname = req.nextUrl.pathname;

  if (pathname.startsWith("/api/admin")) {
    if (isAdmin || validSession) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (pathname === "/dashboard") {
    if (isAdmin) return NextResponse.next();
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (isAdmin) return NextResponse.next();

  const businessId = pathname.split("/")[2];

  const valid = validSession && !!businessId && session!.account.businessId === businessId;

  if (!valid) {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.delete(CLIENT_COOKIE);
    return res;
  }

  // Check subscription status for client access (2-day grace period)
  const business = await prisma.business.findUnique({
    where: { id: businessId! },
    select: {
      subscriptionActive: true,
      subscriptionEndDate: true,
    },
  });

  if (business) {
    const isDisabled = !business.subscriptionActive;
    const isExpired = business.subscriptionEndDate &&
      business.subscriptionEndDate < new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2-day grace period

    if (isDisabled || isExpired) {
      return NextResponse.redirect(new URL("/subscription-expired", req.url));
    }
  }

  return NextResponse.next();
}
