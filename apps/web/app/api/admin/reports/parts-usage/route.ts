import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : undefined;
  const app = await getApp();
  const report = await app.container.router.reporting.getPartsUsage(businessId, from, to);
  return NextResponse.json(report);
}
