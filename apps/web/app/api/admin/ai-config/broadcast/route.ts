import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

/** Appends a rule to the platform default AND every existing client's
 * current AI Brain prompt in one call — for policy rules that must be
 * universal starting now, not just for future clients. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const result = await app.container.router.aiConfig.broadcastAppend(
      body.text,
      typeof body.note === "string" ? body.note : undefined
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
