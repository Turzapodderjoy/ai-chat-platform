import { NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET() {
  const app = await getApp();
  const runs = await app.container.router.training.runs();
  return NextResponse.json({ runs });
}
