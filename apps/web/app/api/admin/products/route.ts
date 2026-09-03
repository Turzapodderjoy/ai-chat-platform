import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/** Product Catalog panel's data source — search + offset pagination. */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const search = req.nextUrl.searchParams.get("search") ?? undefined;
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "25");

  const app = await getApp();
  const result = await app.container.router.products.list(businessId, search, offset, limit);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: "businessId and name are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const product = await app.container.router.products.createProduct({
      businessId: body.businessId,
      name: body.name,
      price: body.price ?? null,
      costPrice: body.costPrice ?? null,
      tier: body.tier ?? undefined,
      stock: body.stock ?? null,
      category: body.category ?? null,
      minStock: body.minStock ?? undefined,
      sku: body.sku ?? null,
      description: body.description ?? null,
    });
    return NextResponse.json(product);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const { id, ...fields } = body;
    const product = await app.container.router.products.updateProduct(id, fields);
    return NextResponse.json(product);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    await app.container.router.products.deleteProduct(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
