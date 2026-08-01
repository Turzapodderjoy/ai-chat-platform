import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const app = await getApp();

  const result = await app.container.router.handoff.listAll({
    businessId: params.get("businessId") ?? undefined,
    channel: params.get("channel") ?? undefined,
    needsHandoffOnly: params.get("needsHandoffOnly") === "true",
    sort: params.get("sort") === "oldest" ? "oldest" : "newest",
    cursor: params.get("cursor") ?? undefined,
    limit: params.get("limit") ? Number(params.get("limit")) : undefined,
  });

  return NextResponse.json(result);
}
