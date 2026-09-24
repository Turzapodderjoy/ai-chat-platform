import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const config = await prisma.reviewAutomationConfig.findUnique({ where: { businessId } });
  return NextResponse.json({ config: config ?? { googleReviewUrl: "", whatsAppReviewUrl: "", autoSend: false, triggerStatus: "completed", delayHours: 0 } });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string") {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const config = await prisma.reviewAutomationConfig.upsert({
    where: { businessId: body.businessId },
    update: {
      googleReviewUrl: body.googleReviewUrl ?? null,
      whatsAppReviewUrl: body.whatsAppReviewUrl ?? null,
      autoSend: body.autoSend ?? false,
      triggerStatus: body.triggerStatus ?? "completed",
      delayHours: body.delayHours ?? 0,
    },
    create: {
      businessId: body.businessId,
      googleReviewUrl: body.googleReviewUrl ?? null,
      whatsAppReviewUrl: body.whatsAppReviewUrl ?? null,
      autoSend: body.autoSend ?? false,
      triggerStatus: body.triggerStatus ?? "completed",
      delayHours: body.delayHours ?? 0,
    },
  });
  return NextResponse.json(config);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || !body.config) {
    return NextResponse.json({ error: "businessId and config required" }, { status: 400 });
  }

  const { businessId, config } = body;
  const preview: any = {};

  if (config.googleReviewUrl) {
    preview.email = {
      subject: "We'd love your feedback!",
      body: `Hi John,\n\nThanks for choosing Test Business! Your repair TEST123 is now complete.\n\nCould you spare a minute to leave a review?\n${config.googleReviewUrl}\n\nThanks,\nTest Business`,
    };
    preview.whatsapp = `Hi John! Your repair TEST123 is complete. 🙏 Please leave a quick review: ${config.googleReviewUrl}`;
  }

  if (config.whatsAppReviewUrl) {
    preview.whatsapp = `Hi John! Your repair TEST123 is complete. 🙏 Please leave a quick review: ${config.whatsAppReviewUrl}`;
  }

  return NextResponse.json({ preview });
}