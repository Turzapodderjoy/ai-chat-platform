import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../lib/app";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getApp();
  const run = await app.container.router.training.getAnalysisRun(id);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(run);
}
