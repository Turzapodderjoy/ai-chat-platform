import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  if (!ids) {
    return NextResponse.json({ tagsByOrderId: {} });
  }

  const app = await getApp();
  const map = await app.container.router.tags.orderTagsForMany(ids.split(",").filter(Boolean));

  return NextResponse.json({ tagsByOrderId: Object.fromEntries(map) });
}
