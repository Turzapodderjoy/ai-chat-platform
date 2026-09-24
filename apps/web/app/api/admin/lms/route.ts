import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

// Wave B #31 - LMS onboarding scaffold API. Lean LmsLite structure (single
// self-contained training item) so a shop can seed onboarding content before
// the full catalog/lesson/enrollment model lands in Wave C. Same contract as
// sibling admin routes: businessId passed in, no auth actor, plain fields.

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const items = await prisma.lmsLite.findMany({
    where: { businessId },
    orderBy: [{ order: "asc" }, { title: "asc" }],
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    businessId?: string;
    title?: string;
    type?: string;
    description?: string;
    content?: string;
    order?: number;
  } | null;

  if (!body?.businessId || !body.title) {
    return NextResponse.json({ error: "businessId and title are required" }, { status: 400 });
  }

  const item = await prisma.lmsLite.create({
    data: {
      businessId: body.businessId,
      title: body.title,
      type: body.type ?? "guide",
      description: body.description ?? null,
      content: body.content ?? null,
      order: body.order ?? 0,
    },
  });
  return NextResponse.json({ item }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    title?: string;
    type?: string;
    description?: string | null;
    content?: string | null;
    order?: number;
    isActive?: boolean;
  } | null;

  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const item = await prisma.lmsLite.update({
    where: { id: body.id },
    data: {
      title: body.title,
      type: body.type,
      description: body.description,
      content: body.content,
      order: body.order,
      isActive: body.isActive,
    },
  });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await prisma.lmsLite.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}