import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.languageMode !== "string") {
    return NextResponse.json({ error: "languageMode is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const result = await app.container.router.aiConfig.setLanguageMode(
      body.languageMode,
      typeof body.businessId === "string" ? body.businessId : undefined
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
