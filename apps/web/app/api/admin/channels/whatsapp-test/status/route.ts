import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../lib/app";

/** Polled while the QR is on screen — once the session reports "ready"
 * this also persists the ChannelConnection (see
 * ChannelController.testWhatsappStatus). */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const result = await app.container.router.channels.testWhatsappStatus(businessId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
