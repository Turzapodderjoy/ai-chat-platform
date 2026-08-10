import { NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

/** Platform-wide (mother dashboard) view — one row per business showing
 * whether its knowledge base is actually fully crawled/uploaded and
 * reflected in its master CSV, not just whether a refresh was clicked. */
export async function GET() {
  const app = await getApp();
  const status = await app.container.router.knowledgeRefresh.getAllStatus();
  return NextResponse.json({ status });
}
