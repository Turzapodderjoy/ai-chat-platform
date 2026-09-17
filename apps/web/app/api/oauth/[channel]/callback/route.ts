import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { getPublicBaseUrl } from "../../../../../lib/request-origin";

/** Meta redirects here with `code` + `state` (the businessId from the
 * start route) after the user approves the connection. Exchanges the
 * code for a durable token and persists the ChannelConnection, then
 * bounces back to that client's dashboard Integrations tab. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
  const code = req.nextUrl.searchParams.get("code");
  const businessId = req.nextUrl.searchParams.get("state");

  if (!code || !businessId) {
    return NextResponse.json({ error: "code and state are required" }, { status: 400 });
  }

  // Must byte-for-byte match the start route's own redirectUri (see its
  // comment) -- and the two post-exchange redirects below send the
  // user's own browser back to the dashboard, so those need the real
  // public origin too, not the VPS's internal localhost:3001.
  const baseUrl = getPublicBaseUrl(req);
  const redirectUri = `${baseUrl}/api/oauth/${channel}/callback`;

  try {
    const app = await getApp();
    await app.container.router.channels.oauthCallback(channel, code, businessId, redirectUri);
    return NextResponse.redirect(`${baseUrl}/dashboard/${businessId}?tab=channels&connected=${channel}`);
  } catch (err) {
    return NextResponse.redirect(
      `${baseUrl}/dashboard/${businessId}?tab=channels&error=${encodeURIComponent(
        err instanceof Error ? err.message : String(err)
      )}`
    );
  }
}
