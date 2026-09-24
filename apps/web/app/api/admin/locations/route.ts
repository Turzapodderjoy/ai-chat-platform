import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

// Wave B #11 - Locations admin API. Simple business-scoped CRUD sibling of the
// closing-checklist route: browser panels get a passed-in businessId (no auth
// actor needed), money stays out (plain strings/booleans only).

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const locations = await prisma.location.findMany({
    where: { businessId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ locations });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    businessId?: string;
    name?: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
    isActive?: boolean;
  } | null;

  if (!body?.businessId || !body.name) {
    return NextResponse.json({ error: "businessId and name are required" }, { status: 400 });
  }

  const location = await prisma.location.create({
    data: {
      businessId: body.businessId,
      name: body.name,
      address: body.address ?? null,
      city: body.city ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      isActive: body.isActive ?? true,
    },
  });
  return NextResponse.json({ location }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    name?: string;
    address?: string | null;
    city?: string | null;
    phone?: string | null;
    email?: string | null;
    isActive?: boolean;
  } | null;

  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const location = await prisma.location.update({
    where: { id: body.id },
    data: {
      name: body.name,
      address: body.address,
      city: body.city,
      phone: body.phone,
      email: body.email,
      isActive: body.isActive,
    },
  });
  return NextResponse.json({ location });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await prisma.location.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}