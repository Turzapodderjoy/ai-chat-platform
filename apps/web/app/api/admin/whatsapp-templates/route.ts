import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const templates = await prisma.whatsAppTemplate.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ templates });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || !body.kind || !body.statusValue || !body.name || !body.body) {
    return NextResponse.json({ error: "businessId, kind, statusValue, name, body are required" }, { status: 400 });
  }

  const template = await prisma.whatsAppTemplate.upsert({
    where: { businessId_kind_statusValue: { businessId: body.businessId, kind: body.kind, statusValue: body.statusValue } },
    update: {
      name: body.name,
      language: body.language ?? "en_US",
      header: body.header ?? null,
      body: body.body,
      footer: body.footer ?? null,
      buttons: body.buttons ?? null,
      enabled: body.enabled ?? true,
    },
    create: {
      businessId: body.businessId,
      kind: body.kind,
      statusValue: body.statusValue,
      name: body.name,
      language: body.language ?? "en_US",
      header: body.header ?? null,
      body: body.body,
      footer: body.footer ?? null,
      buttons: body.buttons ?? null,
      enabled: body.enabled ?? true,
    },
  });
  return NextResponse.json(template);
}