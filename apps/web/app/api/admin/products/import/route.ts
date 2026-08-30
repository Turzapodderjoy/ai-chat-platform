import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

/** Bulk inventory import from an uploaded CSV or .xlsx file — the panel
 * sends the raw file bytes as multipart form data (not base64/JSON;
 * a real spreadsheet can be a few MB, no reason to inflate it ~33% for
 * the round trip). See ProductSyncService.importRows for the actual
 * parsing (reuses the crawler's own column-alias matcher). */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const businessId = form?.get("businessId");
  const file = form?.get("file");

  if (typeof businessId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "businessId and file are required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const app = await getApp();
  const result = await app.container.router.products.importProducts(businessId, buffer);
  return NextResponse.json(result);
}
