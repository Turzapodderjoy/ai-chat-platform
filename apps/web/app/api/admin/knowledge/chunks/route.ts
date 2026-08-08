import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get("documentId");

  if (!documentId) {
    return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  }

  const app = await getApp();
  const chunks = await app.container.router.admin.documentChunks(documentId);
  return NextResponse.json({ chunks });
}
