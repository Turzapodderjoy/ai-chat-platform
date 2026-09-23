import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET() {
  const app = await getApp();
  return NextResponse.json({ agents: await app.container.router.hermes.list() });
}

export async function POST(req: NextRequest) {
  const app = await getApp();
  const body = (await req.json().catch(() => ({}))) as { slug?: string; soul?: string };
  try {
    const created = await app.container.router.hermes.create({ slug: body.slug ?? "", soul: body.soul });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}