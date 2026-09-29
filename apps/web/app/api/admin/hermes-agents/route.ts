import { NextRequest, NextResponse } from "next/server";

import { verifyAdminToken } from "@ai-chat-platform/client-auth";

import { getApp } from "../../../../lib/app";

const ADMIN_COOKIE = "admin_session";

export const dynamic = "force-dynamic";

// Agent rows carry the per-agent API_SERVER_KEY, so THIS route is gated to
// the fixed admin cookie — middleware alone only proves "some authenticated
// session", and a client account must never read the platform's gateway keys.
function authorized(req: NextRequest): boolean {
  return verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value ?? "");
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const app = await getApp();
  return NextResponse.json({ agents: await app.container.router.hermes.list() });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const app = await getApp();
  const body = (await req.json().catch(() => ({}))) as { slug?: string; soul?: string };
  try {
    const created = await app.container.router.hermes.create({ slug: body.slug ?? "", soul: body.soul });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}