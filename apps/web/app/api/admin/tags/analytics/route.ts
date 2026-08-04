import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const businessId = params.get("businessId");

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const tagIds = params.get("tagIds");

  const app = await getApp();
  const result = await app.container.router.tags.getAnalytics({
    businessId,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    tagIds: tagIds ? tagIds.split(",").filter(Boolean) : undefined,
    channel: params.get("channel") ?? undefined,
  });

  return NextResponse.json(result);
}
