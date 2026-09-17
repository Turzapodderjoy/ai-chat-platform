import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { getPublicBaseUrl } from "../../../../../lib/request-origin";

/** Redirects to Meta's OAuth dialog for this channel. `businessId` is
 * carried through as the `state` param so the callback knows which
 * client to attach the resulting connection to. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  // Must byte-for-byte match the callback route's own redirectUri below --
  // Meta rejects a token exchange whose redirect_uri differs at all from
  // the one used to start the OAuth dialog, so both need the same fix
  // (see getPublicBaseUrl's own comment for why req.nextUrl.origin alone
  // baked the VPS's internal localhost:3001 into this, which Meta never
  // has whitelisted -- every channel connection attempt would fail).
  const redirectUri = `${getPublicBaseUrl(req)}/api/oauth/${channel}/callback`;

  try {
    const app = await getApp();
    const url = await app.container.router.channels.oauthStartUrl(channel, businessId, redirectUri);
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
