import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

// Deliberately a local literal, not imported from the backend package —
// same pattern as dashboard/page.tsx's own PLATFORM_CONFIG_ID constant.
const PLATFORM_CONFIG_ID = "__platform__";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? PLATFORM_CONFIG_ID;
  const app = await getApp();

  return NextResponse.json({
    sessions: await app.container.router.training.listTrainingSessions(businessId),
  });
}
