import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const app = await getApp();
  const offers = await app.container.router.offers.listForBusiness(businessId);
  return NextResponse.json(offers);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const required = ["businessId", "title", "discountType", "discountValue"];
  const missing = required.filter((k) => body[k] === undefined || body[k] === null);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing: ${missing.join(", ")}` }, { status: 400 });
  }

  const app = await getApp();
  const offer = await app.container.router.offers.create({
    businessId: body.businessId,
    title: body.title,
    description: body.description,
    discountType: body.discountType,
    discountValue: body.discountValue,
    promoCode: body.promoCode,
    validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
    validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
    maxUses: body.maxUses,
  });
  return NextResponse.json(offer);
}
