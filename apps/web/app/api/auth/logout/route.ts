import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

const COOKIE_NAME = "client_session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (token) {
    const app = await getApp();
    await app.container.router.clientAuth.logout(token);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
