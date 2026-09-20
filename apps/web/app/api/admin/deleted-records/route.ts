import { NextRequest, NextResponse } from "next/server";
import { listDeleted } from "@ai-chat-platform/database";

import { isPlatformAdmin } from "../../../../lib/admin-actor";

/** Everything deleted through the app for one business, newest first.
 * Admin-only on the server, not just hidden in the UI -- a client's own
 * session can otherwise reach any /api/admin/* route directly. */
export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }
  const records = await listDeleted(businessId, req.nextUrl.searchParams.get("entityType") ?? undefined);
  return NextResponse.json({ records });
}
