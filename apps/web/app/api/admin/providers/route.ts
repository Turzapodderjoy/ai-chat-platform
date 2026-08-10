import { NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET() {
  const app = await getApp();
  const admin = app.container.router.admin;

  return NextResponse.json({
    ...(await admin.providers()),
    catalog: admin.catalog(),
  });
}
