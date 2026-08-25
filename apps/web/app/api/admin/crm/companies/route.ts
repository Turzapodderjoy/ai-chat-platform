import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const app = await getApp();
  const companies = await app.container.router.crm.listCompanies(businessId);
  return NextResponse.json({ companies });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: "businessId and name are required" }, { status: 400 });
  }
  const app = await getApp();
  const result = await app.container.router.crm.createCompany(body.businessId, body.name, body.domain);
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const app = await getApp();
  await app.container.router.crm.deleteCompany(id);
  return NextResponse.json({ ok: true });
}
