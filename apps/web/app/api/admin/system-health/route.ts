import { NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/** Mother dashboard's VPS Health panel -- raw OS stats for whichever
 * machine this Next.js process is actually running on. */
export async function GET() {
  const app = await getApp();
  const stats = app.container.router.health.systemStats();
  return NextResponse.json(stats);
}
