import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  if (!ids) {
    return NextResponse.json({ tagsByMessageId: {} });
  }

  const app = await getApp();
  const map = await app.container.router.tags.messageTagsForMany(ids.split(",").filter(Boolean));

  return NextResponse.json({ tagsByMessageId: Object.fromEntries(map) });
}
