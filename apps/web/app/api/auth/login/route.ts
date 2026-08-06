import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

const COOKIE_NAME = "client_session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  const app = await getApp();
  const result = await app.container.router.clientAuth.login(
    body.username,
    body.password,
    Boolean(body.remember)
  );

  if (!result) {
    return NextResponse.json({ error: "Incorrect username or password, or this account has been disabled." }, { status: 401 });
  }

  const res = NextResponse.json({ businessId: result.businessId });
  res.cookies.set(COOKIE_NAME, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: result.expiresAt,
  });
  return res;
}
