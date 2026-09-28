import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

// Wave C #30 - LMS course enrollments. Assign a course to staff and track
// status/progress. Same contract as sibling admin routes.

export async function GET(req: NextRequest) {
  const courseId = req.nextUrl.searchParams.get("courseId");
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId: courseId ?? undefined },
    include: {
      staff: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });
  return NextResponse.json({ enrollments });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    staffId?: string;
    status?: string;
    progress?: number;
  } | null;

  if (!body?.courseId || !body.staffId) {
    return NextResponse.json({ error: "courseId and staffId are required" }, { status: 400 });
  }

  const enrollment = await prisma.courseEnrollment.upsert({
    where: { courseId_staffId: { courseId: body.courseId, staffId: body.staffId } },
    update: { status: body.status ?? "assigned", progress: body.progress ?? 0 },
    create: {
      courseId: body.courseId,
      staffId: body.staffId,
      status: body.status ?? "assigned",
      progress: body.progress ?? 0,
    },
  });
  return NextResponse.json({ enrollment }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    status?: string;
    progress?: number;
  } | null;

  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const enrollment = await prisma.courseEnrollment.update({
    where: { id: body.id },
    data: { status: body.status, progress: body.progress },
  });
  return NextResponse.json({ enrollment });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await prisma.courseEnrollment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}