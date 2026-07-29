import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/**
 * Deliberately NOT listed in vercel.json's crons array — Vercel's free/
 * Hobby plan doesn't just silently cap a sub-daily schedule to once/day,
 * it REJECTS THE ENTIRE DEPLOY at build time with "Hobby accounts are
 * limited to daily cron jobs" if any cron entry runs more than once a
 * day (confirmed live). Since this needs to run every 30 minutes AND
 * work identically for an offline/local deployment (which has no Vercel
 * cron at all), the real cadence comes from an external trigger instead —
 * see .github/workflows/auto-heal.yml (a free GitHub Actions scheduled
 * workflow, no Vercel plan change needed) hitting this route with the
 * CRON_SECRET bearer header every 30 minutes. This route is still a
 * completely normal, always-deployed API endpoint — it just isn't driven
 * by Vercel's own scheduler.
 *
 * Unlike the other 3 cron routes (crawl/backfill-embeddings/training-
 * pipeline), this one wraps the call in try/catch — AutoHealService.run()
 * already catches internally to write a terminal status to AutoHealRun,
 * but this is a second, thinner safety net for anything that escapes even
 * that (e.g. getApp() itself failing before run() is ever reached).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const app = await getApp();
    const result = await app.container.router.autoHeal.run("cron");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
