import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../lib/app";
import { isAdminRequest } from "../../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * "What it learned" + "how it's going" for one agent. view=raw returns the
 * underlying message/usage rows for the panel's raw explorer.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const app = await getApp();
  const { slug } = await params;
  const view = new URL(req.url).searchParams.get("view") === "raw" ? "raw" : "curated";
  try {
    return NextResponse.json(await app.container.router.hermes.insights(slug, view));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
