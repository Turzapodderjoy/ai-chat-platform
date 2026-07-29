import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/** Meta's webhook verification handshake — sent once when the webhook
 * subscription is set up (and any time it's re-verified). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;

  const app = await getApp();
  const challenge = await app.container.router.channels.webhookVerify(channel, req.nextUrl.searchParams);

  if (challenge === null) {
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

/** Inbound message delivery — parsed by the channel's adapter, answered
 * through the same RAG pipeline every other channel uses, replied to
 * through that channel's Send API. Always returns 200 quickly (Meta
 * retries aggressively on non-200s); real failures are logged, not
 * surfaced to Meta as a delivery error. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
  const payload = await req.json().catch(() => null);

  if (payload) {
    const app = await getApp();
    app.container.router.channels.webhookEvent(channel, payload).catch((err) => {
      console.error(`Webhook event handling failed for channel "${channel}":`, err);
    });
  }

  return NextResponse.json({ received: true });
}
