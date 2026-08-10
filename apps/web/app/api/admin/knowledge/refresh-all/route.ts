import { NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

// Vercel Hobby max — only relevant if this ever runs on Vercel again; a
// persistent host ignores it. See refresh-now/route.ts.
export const maxDuration = 60;

/** Mother-dashboard "refresh every client" button — recrawl + reprocess
 * uploads + rebuild the master CSV for every business on the platform,
 * each independently, without waiting on the user's request. Not
 * awaited, not wrapped in after() — see admin/crawler/route.ts's
 * comment for why after() doesn't work self-hosted and isn't needed. */
export async function POST() {
  const app = await getApp();
  app.container.router.knowledgeRefresh.runRefreshAll().catch((err) => {
    console.error("[refresh-all] failed:", err);
  });
  return NextResponse.json({ started: true });
}
