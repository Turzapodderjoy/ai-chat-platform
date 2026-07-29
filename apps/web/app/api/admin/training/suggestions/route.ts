import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const app = await getApp();

  return NextResponse.json({
    pending: await app.container.router.training.pendingSuggestions(businessId),
    decided: await app.container.router.training.decidedSuggestions(businessId),
  });
}
