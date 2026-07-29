import { NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

/** Manual trigger for the same pipeline the 5am BST cron runs — lets an
 * admin force a run right after QA'ing a chat or changing something,
 * instead of waiting for the next scheduled run. No CRON_SECRET check
 * (unlike /api/cron/training-pipeline): this is a normal dashboard admin
 * action, not the scheduled job. */
export async function POST() {
  const app = await getApp();
  const result = await app.container.router.training.runPipeline("manual");
  return NextResponse.json(result);
}
