import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

const PLATFORM_CONFIG_ID = "__platform__";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? PLATFORM_CONFIG_ID;
  const app = await getApp();

  return NextResponse.json({
    reviews: await app.container.router.training.listReviews(businessId),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.conversationId !== "string") {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  try {
    const app = await getApp();

    if (body.decision !== undefined) {
      if (body.decision !== null && body.decision !== "add" && body.decision !== "drop") {
        return NextResponse.json({ error: 'decision must be "add", "drop", or null' }, { status: 400 });
      }
      const result = await app.container.router.training.setDecision(body.conversationId, body.decision);
      return NextResponse.json(result);
    }

    if (body.qaVerdict !== undefined || body.qaNote !== undefined) {
      if (body.qaVerdict !== undefined && body.qaVerdict !== null && body.qaVerdict !== "pass" && body.qaVerdict !== "fail") {
        return NextResponse.json({ error: 'qaVerdict must be "pass", "fail", or null' }, { status: 400 });
      }
      const result = await app.container.router.training.setQa(
        body.conversationId,
        body.qaVerdict ?? null,
        typeof body.qaNote === "string" ? body.qaNote : null
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Provide decision or qaVerdict/qaNote to update." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
