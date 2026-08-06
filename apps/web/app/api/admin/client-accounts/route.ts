import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET() {
  const app = await getApp();
  const accounts = await app.container.router.clientAuth.listAccounts();
  return NextResponse.json({ accounts });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.businessId !== "string" || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "businessId, username, and password are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const account = await app.container.router.clientAuth.createAccount(body.businessId, body.username, body.password);
    return NextResponse.json(account);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string" || typeof body.disabled !== "boolean") {
    return NextResponse.json({ error: "id and disabled are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    await app.container.router.clientAuth.setDisabled(body.id, body.disabled);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    await app.container.router.clientAuth.deleteAccount(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
