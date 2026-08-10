import { NextResponse } from "next/server";
import { after } from "next/server";

import { getApp } from "../../../../../lib/app";

// Vercel Hobby max — see refresh-now/route.ts. Each business's own refresh
// still runs via runRefreshAll()'s internal fire-and-forget, so this mostly
// just needs enough time to kick every business off.
export const maxDuration = 60;

/** Mother-dashboard "refresh every client" button — recrawl + reprocess
 * uploads + rebuild the master CSV for every business on the platform,
 * each independently, without waiting on the user's request. */
export async function POST() {
  const app = await getApp();
  after(() => app.container.router.knowledgeRefresh.runRefreshAll().catch(() => {}));
  return NextResponse.json({ started: true });
}
