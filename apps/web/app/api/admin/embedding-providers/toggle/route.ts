import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string" || typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "id and enabled (boolean) are required" },
      { status: 400 }
    );
  }

  try {
    const app = await getApp();
    const result = await app.container.router.embedding.setProviderEnabled(body.id, body.enabled);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
