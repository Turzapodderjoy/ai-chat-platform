import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../lib/app";

export async function GET() {
  const app = await getApp();
  const mode = await app.container.router.dashboardTheme.get();
  return NextResponse.json({ mode });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || (body.mode !== "dark" && body.mode !== "light")) {
    return NextResponse.json({ error: "mode must be 'dark' or 'light'" }, { status: 400 });
  }

  const app = await getApp();
  const mode = await app.container.router.dashboardTheme.set(body.mode);
  return NextResponse.json({ mode });
}
