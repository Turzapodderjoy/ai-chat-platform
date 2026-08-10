import { NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/** Mother dashboard's "Client Health" tab — one consolidated view of
 * every client's knowledge base, embedding coverage, handoffs, and
 * chat volume, instead of checking five different tabs per business. */
export async function GET() {
  const app = await getApp();
  const rows = await app.container.router.clientHealth.getAll();
  return NextResponse.json({ rows });
}
