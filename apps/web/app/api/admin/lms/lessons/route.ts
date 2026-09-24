import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

// Wave C #30 - LMS lessons for a course. Same contract as sibling admin
// routes: ids/courseId passed in, no auth actor, plain fields.

export async function GET(req: NextRequest) {
  const courseId = req.nextUrl.searchParams.get("courseId");
  const lessons = await prisma.courseLesson.findMany({
    where: { courseId: courseId ?? undefined },
    orderBy: [{ order: "asc" }, { title: "asc" }],
  });
  return NextResponse.json({ lessons });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    title?: string;
    content?: string;
    order?: number;
  } | null;

  if (!body?.courseId || !body.title) {
    return NextResponse.json({ error: "courseId and title are required" }, { status: 400 });
  }

  const lesson = await prisma.courseLesson.create({
    data: {
      courseId: body.courseId,
      title: body.title,
      content: body.content ?? null,
      order: body.order ?? 0,
    },
  });
  return NextResponse.json({ lesson }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    title?: string;
    content?: string | null;
    order?: number;
  } | null;

  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const lesson = await prisma.courseLesson.update({
    where: { id: body.id },
    data: { title: body.title, content: body.content, order: body.order },
  });
  return NextResponse.json({ lesson });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await prisma.courseLesson.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}