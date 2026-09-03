import { NextRequest, NextResponse } from "next/server";
import { checkAdminCredentials, createAdminToken, DeviceLimitError } from "@ai-chat-platform/client-auth";

import { getApp } from "../../../../lib/app";

const CLIENT_COOKIE = "client_session";
const ADMIN_COOKIE = "admin_session";

// Behind the cloudflared tunnel there's no raw socket to read from --
// the real client IP only ever arrives as a forwarded header.
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  const remember = Boolean(body.remember);

  // The single fixed admin identity — checked first since it's a cheap
  // in-memory comparison, no DB round-trip needed before falling
  // through to the real client-account lookup below.
  if (checkAdminCredentials(body.username, body.password)) {
    const { token, expiresAt } = createAdminToken(remember ? 30 : 1);
    const res = NextResponse.json({ admin: true });
    res.cookies.delete(CLIENT_COOKIE);
    res.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  }

  const app = await getApp();

  let result;
  try {
    result = await app.container.router.clientAuth.login(body.username, body.password, remember, clientIp(req));
  } catch (err) {
    if (err instanceof DeviceLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  if (!result) {
    return NextResponse.json({ error: "Incorrect username or password, or this account has been disabled." }, { status: 401 });
  }

  // A DB-backed isAdmin account reaches the mother dashboard through the
  // same client_session cookie as any other client login (proxy.ts
  // checks the account's isAdmin flag on every request) — only the
  // response shape changes, to match home-client.tsx's existing
  // `data.admin ? "/dashboard" : ...` redirect.
  const res = NextResponse.json(result.isAdmin ? { admin: true } : { businessId: result.businessId });
  res.cookies.delete(ADMIN_COOKIE);
  res.cookies.set(CLIENT_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: result.expiresAt,
  });
  return res;
}
