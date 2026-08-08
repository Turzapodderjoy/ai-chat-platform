import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const schedule = await app.container.router.knowledgeRefresh.getSchedule(businessId);
  return NextResponse.json(schedule);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string" || typeof body.hourBd !== "number") {
    return NextResponse.json({ error: "businessId and hourBd (0-23) are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const schedule = await app.container.router.knowledgeRefresh.setSchedule(body.businessId, body.hourBd);
    return NextResponse.json(schedule);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
