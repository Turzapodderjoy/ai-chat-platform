import { NextRequest, NextResponse } from "next/server";

import { runExpirationNotifications } from "@ai-chat-platform/billing";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runExpirationNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[Billing Cron] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
