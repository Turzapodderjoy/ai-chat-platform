import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const config = await prisma.whatsAppSenderConfig.findUnique({ where: { businessId } });
  return NextResponse.json({ connected: !!config, phoneNumberId: config?.phoneNumberId ?? null });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || !body.phoneNumberId || !body.accessToken) {
    return NextResponse.json({ error: "businessId, phoneNumberId, accessToken are required" }, { status: 400 });
  }

  const config = await prisma.whatsAppSenderConfig.upsert({
    where: { businessId: body.businessId },
    update: { phoneNumberId: body.phoneNumberId, accessToken: body.accessToken },
    create: { businessId: body.businessId, phoneNumberId: body.phoneNumberId, accessToken: body.accessToken },
  });
  return NextResponse.json({ ok: true, connected: true, phoneNumberId: config.phoneNumberId });
}

export async function DELETE(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  await prisma.whatsAppSenderConfig.delete({ where: { businessId } }).catch(() => {});
  return NextResponse.json({ ok: true, connected: false });
}