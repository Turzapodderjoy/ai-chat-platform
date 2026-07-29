import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/** Catalog of every channel + this business's connections, in one call —
 * the ChannelsPanel dashboard tab's single data source. */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const baseUrl = req.nextUrl.origin;

  const [catalog, connections, embed] = await Promise.all([
    app.container.router.channels.catalog(),
    app.container.router.channels.connections(businessId),
    app.container.router.channels.embedSnippet(businessId, baseUrl),
  ]);

  return NextResponse.json({ catalog, connections, embedSnippet: embed.snippet });
}
