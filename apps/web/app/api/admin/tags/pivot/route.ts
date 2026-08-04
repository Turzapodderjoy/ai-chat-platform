import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string" || !Array.isArray(body.dimensions)) {
    return NextResponse.json({ error: "businessId and dimensions are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const result = await app.container.router.tags.getPivot({
      businessId: body.businessId,
      dimensions: body.dimensions,
      measure: body.measure === "messageCount" ? "messageCount" : "conversationCount",
      from: typeof body.from === "string" ? body.from : undefined,
      to: typeof body.to === "string" ? body.to : undefined,
      tagIds: Array.isArray(body.tagIds) ? body.tagIds : undefined,
      channel: typeof body.channel === "string" ? body.channel : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
