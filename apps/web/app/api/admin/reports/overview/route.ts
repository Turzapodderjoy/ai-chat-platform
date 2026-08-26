import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const app = await getApp();
  const report = await app.container.router.reporting.getOverview(businessId);
  return NextResponse.json(report);
}
