import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  if (!ids) {
    return NextResponse.json({ tagsByConversationId: {} });
  }

  const app = await getApp();
  const map = await app.container.router.tags.conversationTagsForMany(ids.split(",").filter(Boolean));

  return NextResponse.json({ tagsByConversationId: Object.fromEntries(map) });
}
