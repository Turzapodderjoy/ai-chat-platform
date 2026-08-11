import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  const download = req.nextUrl.searchParams.get("download") === "true";

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const masterCsv = await app.container.router.knowledgeRefresh.getMasterCsv(businessId);

  if (download) {
    return new NextResponse(masterCsv?.content ?? "", {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="knowledge-${businessId}.csv"`,
      },
    });
  }

  // A large business's CSV can be tens of MB — the panel only needs to
  // show "built at X, covers N sources", not the whole file inline.
  // Content only ships on an explicit download.
  const sourceCount = masterCsv ? (masterCsv.content.match(/^# Source: /gm) ?? []).length : 0;

  return NextResponse.json({
    masterCsv: masterCsv ? { businessId: masterCsv.businessId, updatedAt: masterCsv.updatedAt, sourceCount } : null,
  });
}
