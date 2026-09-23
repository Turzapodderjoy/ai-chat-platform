import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const app = await getApp();
  const { slug } = await params;
  const body = (await req.json().catch(() => ({}))) as { soul?: string; model?: string; provider?: string };
  try {
    const updated = await app.container.router.hermes.update(slug, body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const app = await getApp();
  const { slug } = await params;
  try {
    return NextResponse.json(await app.container.router.hermes.delete(slug));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}