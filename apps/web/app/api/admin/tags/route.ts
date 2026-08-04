import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const app = await getApp();
  const tags = await app.container.router.tags.listTags(businessId);
  return NextResponse.json({ tags });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.label !== "string") {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const tag = await app.container.router.tags.createTag({
      businessId: typeof body.businessId === "string" ? body.businessId : undefined,
      label: body.label,
      color: typeof body.color === "string" ? body.color : null,
      isFunnelStage: Boolean(body.isFunnelStage),
      funnelOrder: typeof body.funnelOrder === "number" ? body.funnelOrder : null,
    });
    return NextResponse.json(tag);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const tag = await app.container.router.tags.updateTag(body.id, {
      label: typeof body.label === "string" ? body.label : undefined,
      color: body.color !== undefined ? body.color : undefined,
      isFunnelStage: typeof body.isFunnelStage === "boolean" ? body.isFunnelStage : undefined,
      funnelOrder: body.funnelOrder !== undefined ? body.funnelOrder : undefined,
    });
    return NextResponse.json(tag);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    await app.container.router.tags.deleteTag(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
