import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

/** Manual "resync the Product table now" from whatever's already
 * indexed — normally runs automatically at the end of every recrawl. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string") {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const result = await app.container.router.crawler.syncProducts(body.businessId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
