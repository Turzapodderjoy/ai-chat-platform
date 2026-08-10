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
  // req.nextUrl.origin reflects the raw Host header Next's own server
  // process saw, which a reverse proxy in front of `next start` (e.g.
  // Cloudflare Tunnel, Nginx) doesn't always forward faithfully — it
  // showed up as the app's own bind address (localhost:3001) instead of
  // the real public hostname when self-hosted behind cloudflared,
  // baking the wrong domain into every business's embed snippet.
  // X-Forwarded-Host/-Proto are the standard headers a proxy sets for
  // exactly this, and Vercel sets them correctly too, so preferring them
  // is safe there as well.
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  const baseUrl = forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin;

  const [catalog, connections, embed] = await Promise.all([
    app.container.router.channels.catalog(),
    app.container.router.channels.connections(businessId),
    app.container.router.channels.embedSnippet(businessId, baseUrl),
  ]);

  return NextResponse.json({ catalog, connections, embedSnippet: embed.snippet });
}
