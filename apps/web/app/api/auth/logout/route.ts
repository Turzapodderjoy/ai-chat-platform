import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

const CLIENT_COOKIE = "client_session";
const ADMIN_COOKIE = "admin_session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(CLIENT_COOKIE)?.value;

  if (token) {
    const app = await getApp();
    await app.container.router.clientAuth.logout(token);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(CLIENT_COOKIE);
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
