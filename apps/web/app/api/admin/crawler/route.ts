import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const app = await getApp();
  return NextResponse.json({
    targets: await app.container.router.crawler.list(businessId),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string" || typeof body.url !== "string") {
    return NextResponse.json({ error: "businessId and url are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const target = await app.container.router.crawler.queue(body.businessId, body.url);

    // Respond immediately with "queued"; the client polls GET for
    // progress while this runs in the background. Deliberately NOT
    // awaited and NOT wrapped in after() — this is a persistent Node
    // process (not serverless/edge), so an un-awaited promise just keeps
    // running on the event loop after the response is sent; after() is
    // an edge/serverless-specific API that was confirmed to silently
    // never fire when self-hosted behind a custom server + reverse proxy.
    app.container.router.crawler.runCrawl(target.id).catch(() => {});

    return NextResponse.json(target);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
