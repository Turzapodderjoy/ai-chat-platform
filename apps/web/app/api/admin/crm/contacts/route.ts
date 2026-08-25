import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(req: NextRequest) {
  const app = await getApp();

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const record = await app.container.router.crm.getContactRecord(id);
    if (!record) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    return NextResponse.json(record);
  }

  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  const phone = req.nextUrl.searchParams.get("phone");
  if (phone && businessId) {
    const contact = await app.container.router.crm.findContactByPhone(businessId, phone);
    return NextResponse.json({ contact });
  }

  const contacts = await app.container.router.crm.listContacts(businessId);
  return NextResponse.json({ contacts });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const app = await getApp();
  const result = await app.container.router.crm.setContactCompany(body.id, body.companyId ?? null);
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const app = await getApp();
  await app.container.router.crm.deleteContact(id);
  return NextResponse.json({ ok: true });
}
