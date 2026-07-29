import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/**
 * Vercel Cron hits this daily (see vercel.json). Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` when that env var is set — set it in
 * production. Locally, with no CRON_SECRET configured, this is open so you
 * can test with a plain curl.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = await getApp();
  const results = await app.container.router.crawler.recrawlAll();

  return NextResponse.json({ recrawled: results.length, results });
}
