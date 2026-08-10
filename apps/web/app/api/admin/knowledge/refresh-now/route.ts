import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

// Vercel Hobby max — only relevant if this ever runs on Vercel again; a
// persistent host ignores it.
export const maxDuration = 60;

// A full refresh (recrawl every target + reprocess every uploaded
// document) can genuinely take a long time on a large site — the owner
// explicitly said that's fine. Fire-and-forget, so the request returns
// immediately instead of the dashboard hanging on the button click. The
// panel polls the schedule/master-csv GET routes for lastRunAt to see
// when it's done. Deliberately NOT wrapped in after() — this is a
// persistent Node process, not serverless/edge, so an un-awaited promise
// just keeps running on the event loop after the response is sent;
// after() is edge/serverless-specific and was confirmed to silently
// never fire when self-hosted behind a custom server + reverse proxy.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string") {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();

  app.container.router.knowledgeRefresh.runRefreshNow(body.businessId).catch(() => {});

  return NextResponse.json({ started: true });
}
