import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET() {
  const app = await getApp();
  return NextResponse.json(await app.container.router.embedding.extractionKeyList());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.apiKey !== "string") {
    return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const result = await app.container.router.embedding.addExtractionKey(
      body.apiKey,
      typeof body.label === "string" ? body.label : undefined
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
