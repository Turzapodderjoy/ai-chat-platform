import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";
import { isAdminRequest } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

// Derived from the controller itself so this route and the controller can
// never drift apart on the create payload shape.
type HermesCreateInput = Parameters<Awaited<ReturnType<typeof getApp>>["container"]["router"]["hermes"]["create"]>[0];

// Agent rows carry the per-agent API_SERVER_KEY, so THIS route is admin-only
// (middleware alone would also admit plain client sessions).
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const app = await getApp();
  return NextResponse.json({ agents: await app.container.router.hermes.list() });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const app = await getApp();
  const body = (await req.json().catch(() => ({}))) as HermesCreateInput;
  try {
    const created = await app.container.router.hermes.create({ slug: body.slug, soul: body.soul, brief: body.brief });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}