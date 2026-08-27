import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

/** Manual backfill for products whose photo predates image captioning
 * (see ProductSyncService.captionMissingImages) — newly synced products
 * caption themselves automatically. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string") {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const result = await app.container.router.products.captionMissingImages(body.businessId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
