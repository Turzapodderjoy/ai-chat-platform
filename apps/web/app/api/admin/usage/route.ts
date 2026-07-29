import { NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET() {
  const app = await getApp();
  return NextResponse.json(app.container.router.admin.usage());
}
