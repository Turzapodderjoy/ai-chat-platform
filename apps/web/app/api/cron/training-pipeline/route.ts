import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/**
 * Vercel Cron hits this daily at 5am BST (see vercel.json) — analyzes a
 * batch of unprocessed conversations through the reasoning LLM, then
 * checks every business for whether enough new signal has accumulated
 * to propose an AI Brain prompt change. Nothing here ever touches a
 * live prompt directly; suggestions sit pending until an admin accepts
 * them in the Training & Insights dashboard tab. Same CRON_SECRET auth
 * pattern as the other two cron routes.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = await getApp();
  const result = await app.container.router.training.runPipeline("cron");

  return NextResponse.json(result);
}
