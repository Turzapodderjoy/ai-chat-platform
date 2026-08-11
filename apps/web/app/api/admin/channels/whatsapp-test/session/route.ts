import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../lib/app";

/** Creates/starts this business's OpenWA session and registers its
 * webhook — call once when the dashboard's "Link WhatsApp (testing)"
 * button is pressed, before polling for the QR code. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string") {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  const baseUrl = forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin;

  try {
    const app = await getApp();
    const result = await app.container.router.channels.createTestWhatsappSession(body.businessId, baseUrl);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
