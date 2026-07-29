import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

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

  const redirectUri = `${req.nextUrl.origin}/api/oauth/${channel}/callback`;

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
