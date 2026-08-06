import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ai-chat-platform/database";
import { verifyAdminToken } from "@ai-chat-platform/client-auth";

// Now that there's a real admin login, the mother dashboard itself
// ("/dashboard" exactly) is gated too — admin-only, no client session
// gets in there. "/dashboard/{businessId}/*" accepts either: an admin
// session (can browse into any client, same as before this feature
// existed) or a client session that matches that exact businessId.
// Client sessions are validated against the DB on every request (not a
// signed stateless cookie) so a client disabled from the mother
// dashboard's Client Access panel is locked out immediately, not just
// after their cookie happens to expire. The admin session is a signed
// stateless token instead — there's only one fixed admin identity, so
// there's nothing to invalidate early for it.
export const config = {
  matcher: ["/dashboard", "/dashboard/:businessId/:path*"],
};

const CLIENT_COOKIE = "client_session";
const ADMIN_COOKIE = "admin_session";

export async function proxy(req: NextRequest) {
  const isAdmin = verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value);

  if (req.nextUrl.pathname === "/dashboard") {
    if (isAdmin) return NextResponse.next();
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (isAdmin) return NextResponse.next();

  const businessId = req.nextUrl.pathname.split("/")[2];
  const token = req.cookies.get(CLIENT_COOKIE)?.value;

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
    res.cookies.delete(CLIENT_COOKIE);
    return res;
  }

  return NextResponse.next();
}
