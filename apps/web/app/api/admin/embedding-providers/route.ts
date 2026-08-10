import { NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET() {
  const app = await getApp();
  const embedding = app.container.router.embedding;

  return NextResponse.json({
    ...(await embedding.providers()),
    catalog: embedding.catalog(),
  });
}
