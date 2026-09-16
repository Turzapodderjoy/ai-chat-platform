import { NextRequest, NextResponse } from "next/server";
import { listAuditLog } from "@ai-chat-platform/database";

/** Full "who did what" history for one entity (a repair appointment, an
 * order-item, or an invoice), newest first -- the hover tooltip on a
 * status renders every entry here, not just the latest. */
export async function GET(req: NextRequest) {
  const entityType = req.nextUrl.searchParams.get("entityType");
  const entityId = req.nextUrl.searchParams.get("entityId");
  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }
  const entries = await listAuditLog(entityType, entityId);
  return NextResponse.json({ entries });
}
