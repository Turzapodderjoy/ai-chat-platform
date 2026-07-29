import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET() {
  const app = await getApp();
  const providers = await app.container.router.admin.customProviders();
  return NextResponse.json({ providers });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (
    !body ||
    typeof body.label !== "string" ||
    typeof body.baseUrl !== "string" ||
    typeof body.model !== "string" ||
    typeof body.apiKey !== "string"
  ) {
    return NextResponse.json(
      { error: "label, baseUrl, model, and apiKey are required" },
      { status: 400 }
    );
  }

  try {
    const app = await getApp();
    const result = await app.container.router.admin.addCustomProvider(
      body.label,
      body.baseUrl,
      body.model,
      body.apiKey
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
