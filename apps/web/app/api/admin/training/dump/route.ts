import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

// Deliberately a local literal, not imported from the backend package —
// same pattern as dashboard/page.tsx's own PLATFORM_CONFIG_ID constant.
const PLATFORM_CONFIG_ID = "__platform__";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.transcript !== "string" || typeof body.instructions !== "string") {
    return NextResponse.json({ error: "transcript and instructions are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const businessId = typeof body.businessId === "string" ? body.businessId : PLATFORM_CONFIG_ID;
    const result = await app.container.router.training.submitDump(businessId, body.transcript, body.instructions);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
