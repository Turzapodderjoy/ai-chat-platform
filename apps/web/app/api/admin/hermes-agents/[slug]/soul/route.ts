import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../lib/app";
import { isAdminRequest } from "../../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Optional model pass that tightens the wizard-composed SOUL.md. Costs one
 * model call on the free-tier account, so it is an explicit admin action.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const app = await getApp();
  const { slug } = await params;
  try {
    return NextResponse.json(await app.container.router.hermes.polishSoul(slug));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
