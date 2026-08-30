import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string" || !Array.isArray(body.images)) {
    return NextResponse.json({ error: "id and images array are required" }, { status: 400 });
  }

  const app = await getApp();
  const result = await app.container.router.repairs.updatePhotos(body.id, body.images);
  return NextResponse.json(result);
}
