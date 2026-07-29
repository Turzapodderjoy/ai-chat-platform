import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string" || typeof body.provider !== "string") {
    return NextResponse.json({ error: "businessId and provider are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const result = await app.container.router.embedding.backfillProvider(body.businessId, body.provider);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
