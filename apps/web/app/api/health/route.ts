import { NextResponse } from "next/server";

import { getApp } from "../../../lib/app";

export const dynamic = "force-dynamic";

/** Public liveness probe — used by the ops monitor, the tunnel probes and
 *  the System Map. No auth by design: a load balancer / tunnel check must
 *  be able to reach it without credentials. */
export async function GET() {
  const app = await getApp();
  return NextResponse.json(app.container.router.health.health());
}