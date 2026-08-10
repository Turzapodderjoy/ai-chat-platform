import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";

import { getApp } from "../../../../../lib/app";

// Give the after() background work the platform's max execution window
// (Vercel Hobby caps at 60s) instead of the default ~10s — a full refresh
// still won't fit in one invocation for a large site, but this reduces how
// often a crawl target gets killed mid-page; auto-heal picks up the rest.
export const maxDuration = 60;

// A full refresh (recrawl every target + reprocess every uploaded
// document) can genuinely take minutes — the owner explicitly said
// that's fine. Fire-and-forget via after(), same pattern as the crawler
// recrawl route, so the request returns immediately instead of the
// dashboard hanging on the button click. The panel polls the schedule/
// master-csv GET routes for lastRunAt to see when it's done.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string") {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();

  after(() => app.container.router.knowledgeRefresh.runRefreshNow(body.businessId).catch(() => {}));

  return NextResponse.json({ started: true });
}
