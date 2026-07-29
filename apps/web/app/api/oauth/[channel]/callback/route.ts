import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

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

  const redirectUri = `${req.nextUrl.origin}/api/oauth/${channel}/callback`;

  try {
    const app = await getApp();
    await app.container.router.channels.oauthCallback(channel, code, businessId, redirectUri);
    return NextResponse.redirect(`${req.nextUrl.origin}/dashboard/${businessId}?tab=channels&connected=${channel}`);
  } catch (err) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/dashboard/${businessId}?tab=channels&error=${encodeURIComponent(
        err instanceof Error ? err.message : String(err)
      )}`
    );
  }
}
