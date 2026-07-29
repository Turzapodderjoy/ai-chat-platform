import { NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

/** Manual trigger for the same auto-heal job the every-30-minute external
 * scheduler runs — lets an admin force a run right after fixing a
 * provider's key or a crawl target's URL, instead of waiting for the next
 * scheduled check. No CRON_SECRET check: this is a normal dashboard admin
 * action, not the scheduled job. */
export async function POST() {
  const app = await getApp();
  const result = await app.container.router.autoHeal.run("manual");
  return NextResponse.json(result);
}
