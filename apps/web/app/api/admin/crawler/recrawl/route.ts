import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const target = await app.container.router.crawler.requeue(body.id);

    after(() => app.container.router.crawler.runCrawl(body.id).catch(() => {}));

    return NextResponse.json(target);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
