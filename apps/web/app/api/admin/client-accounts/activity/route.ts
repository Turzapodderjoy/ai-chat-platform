import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const app = await getApp();
  const history = await app.container.router.clientAuth.activityHistory(id);
  return NextResponse.json({ history });
}
