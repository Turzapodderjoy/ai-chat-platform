import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/**
 * Vercel Cron hits this daily (see vercel.json), right after the crawl
 * cron so freshly-crawled content is included. Fills in any embedding-
 * provider coverage gaps across every client's knowledge base — content
 * indexed while a provider was down, or before a provider was even
 * added, gets embedded under that provider too, so retrieval quality
 * never depends on which provider happened to be available at index
 * time. Same auth pattern as /api/cron/crawl.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = await getApp();
  const result = await app.container.router.embedding.backfillAllProviders();

  return NextResponse.json(result);
}
