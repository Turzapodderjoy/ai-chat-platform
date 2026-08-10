import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

// Vercel Hobby max — only relevant if this ever runs on Vercel again; a
// persistent host ignores it. See refresh-now/route.ts.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const target = await app.container.router.crawler.requeue(body.id);

    // Not awaited, not wrapped in after() — see admin/crawler/route.ts's
    // comment for why after() doesn't work self-hosted and isn't needed.
    app.container.router.crawler.runCrawl(body.id).catch(() => {});

    return NextResponse.json(target);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
