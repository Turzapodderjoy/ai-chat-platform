import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

/** Mother-dashboard-only: the one-time Meta App credentials required
 * before any client can OAuth-connect Messenger/Instagram. */
export async function GET() {
  const app = await getApp();
  return NextResponse.json({
    credentials: await app.container.router.channels.platformAppCredentials(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (
    !body ||
    typeof body.channel !== "string" ||
    typeof body.webhookVerifyToken !== "string"
  ) {
    return NextResponse.json(
      { error: "channel and webhookVerifyToken are required" },
      { status: 400 }
    );
  }

  try {
    const app = await getApp();
    const result = await app.container.router.channels.savePlatformAppCredential(
      body.channel,
      typeof body.appId === "string" ? body.appId : "",
      typeof body.appSecret === "string" ? body.appSecret : "",
      body.webhookVerifyToken
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
