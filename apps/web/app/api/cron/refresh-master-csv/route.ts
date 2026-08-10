import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

// Vercel Hobby max — see refresh-now/route.ts.
export const maxDuration = 60;

/**
 * Same reasoning as apps/web/app/api/cron/auto-heal/route.ts — Vercel's
 * Hobby plan rejects any cron entry running more than once a day, and a
 * per-business custom hour can't be expressed as a single daily Vercel
 * cron anyway. Needs an external scheduler (see .github/workflows/
 * auto-heal.yml for the established pattern) hitting this route once an
 * hour with the CRON_SECRET bearer header.
 *
 * Businesses whose configured hour matches the current Bangladesh-time
 * hour get their refresh triggered. Each business's refresh (recrawl +
 * reprocess uploads + rebuild master CSV) can take minutes, and the
 * owner explicitly said that's fine — fired via after() so this route
 * responds immediately regardless of how many businesses are due this
 * hour or how long their refreshes take, rather than serially awaiting
 * (and risking a platform timeout on) every one of them inline.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentHourBd = (new Date().getUTCHours() + 6) % 24;

  const app = await getApp();
  const due = await app.container.router.knowledgeRefresh.getDue(currentHourBd);

  // Not wrapped in after() — see admin/crawler/route.ts's comment for why
  // after() doesn't work self-hosted and isn't needed on a persistent host.
  for (const businessId of due) {
    app.container.router.knowledgeRefresh.runRefreshNow(businessId).catch(() => {});
  }

  return NextResponse.json({ hourBd: currentHourBd, triggered: due });
}
