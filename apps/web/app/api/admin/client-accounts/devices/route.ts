import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { resolveAdminActor } from "../../../../../lib/admin-actor";

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }
  const app = await getApp();
  const devices = await app.container.router.clientAuth.listDevices(accountId);
  return NextResponse.json({ devices });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.accountId !== "string" || typeof body.action !== "string") {
    return NextResponse.json({ error: "accountId and action are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const changedBy = await resolveAdminActor(req);

    if (body.action === "fix") {
      if (typeof body.deviceId !== "string") return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
      await app.container.router.clientAuth.fixDevice(body.accountId, body.deviceId, changedBy);
    } else if (body.action === "block") {
      if (typeof body.deviceId !== "string") return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
      await app.container.router.clientAuth.blockDevice(body.accountId, body.deviceId, changedBy);
    } else if (body.action === "reset") {
      await app.container.router.clientAuth.resetDeviceLimits(body.accountId, changedBy);
    } else {
      return NextResponse.json({ error: `Unknown action "${body.action}"` }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
