import { NextRequest, NextResponse } from "next/server";
import { checkAdminCredentials, createAdminToken, DeviceLimitError } from "@ai-chat-platform/client-auth";

import { getApp } from "../../../../lib/app";

const CLIENT_COOKIE = "client_session";
const ADMIN_COOKIE = "admin_session";

// Simple in-memory rate limit: 10 login attempts per minute per IP.
// ponytail: global in-memory Map, fine for single-process.
const loginRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW_MS = 60_000;

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    loginRateLimitMap.set(ip, { count: 1, resetAt: now + LOGIN_RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= LOGIN_RATE_LIMIT;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && /^\d{1,3}(\.\d{1,3}){3}$/.test(first)) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!checkLoginRateLimit(ip)) {
    return NextResponse.json({ error: "Too many login attempts. Please try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);

  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  const remember = Boolean(body.remember);

  const app = await getApp();

  // The fixed env-var admin login is only the fallback. Once the same
  // username exists in the Admin Users panel, that account governs it
  // (password change, disable, delete all take effect) -- otherwise the
  // env password would keep working no matter what was set there.
  const managedInPanel = await app.container.router.clientAuth.usernameExists(body.username);
  if (!managedInPanel && checkAdminCredentials(body.username, body.password)) {
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
