import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

const PLATFORM_CONFIG_ID = "__platform__";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? PLATFORM_CONFIG_ID;
  const app = await getApp();

  return NextResponse.json({
    runs: await app.container.router.training.listAnalysisRuns(businessId),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.conversationIds) || body.conversationIds.length === 0) {
    return NextResponse.json({ error: "conversationIds (non-empty array) is required" }, { status: 400 });
  }

  const businessId = typeof body.businessId === "string" ? body.businessId : PLATFORM_CONFIG_ID;

  try {
    const app = await getApp();
    const run = await app.container.router.training.runAnalysis(businessId, body.conversationIds);
    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
