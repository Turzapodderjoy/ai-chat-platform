import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

// Wave B #12 - Shifts admin API. Staff scheduling against Locations. Sibling of
// the Wave B #8/#11 routes: browser panel passes businessId, no auth actor,
// datetimes travel as ISO strings (Prisma DateTime fields) and come back the
// same way via JSON serialization.

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const staffId = req.nextUrl.searchParams.get("staffId") ?? undefined;
  const locationId = req.nextUrl.searchParams.get("locationId") ?? undefined;

  const shifts = await prisma.shift.findMany({
    where: { businessId, staffId, locationId },
    orderBy: { startAt: "desc" },
    include: {
      staff: true,
      location: true,
    },
  });
  const staff = await prisma.staff.findMany({
    where: { businessId },
    orderBy: { name: "asc" },
  });
  const locations = await prisma.location.findMany({
    where: { businessId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ shifts, staff, locations });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    businessId?: string;
    staffId?: string | null;
    locationId?: string | null;
    title?: string;
    startAt?: string;
    endAt?: string;
    notes?: string | null;
  } | null;

  if (!body?.businessId || !body.title || !body.startAt || !body.endAt) {
    return NextResponse.json(
      { error: "businessId, title, startAt, and endAt are required" },
      { status: 400 },
    );
  }

  const shift = await prisma.shift.create({
    data: {
      businessId: body.businessId,
      staffId: body.staffId ?? null,
      locationId: body.locationId ?? null,
      title: body.title,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      notes: body.notes ?? null,
    },
    include: { staff: true, location: true },
  });
  return NextResponse.json({ shift }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    staffId?: string | null;
    locationId?: string | null;
    title?: string;
    startAt?: string;
    endAt?: string;
    notes?: string | null;
  } | null;

  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const shift = await prisma.shift.update({
    where: { id: body.id },
    data: {
      staffId: body.staffId,
      locationId: body.locationId,
      title: body.title,
      startAt: body.startAt ? new Date(body.startAt) : undefined,
      endAt: body.endAt ? new Date(body.endAt) : undefined,
      notes: body.notes,
    },
    include: { staff: true, location: true },
  });
  return NextResponse.json({ shift });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await prisma.shift.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}