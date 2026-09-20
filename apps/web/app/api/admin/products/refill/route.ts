import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { resolveAdminActor } from "../../../../../lib/admin-actor";

const optionalNumber = (v: unknown): number | null | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

/** Restock a product: a new lot with its own quantity and (optional) cost
 * and sell price. The product's current cost/price move to the new lot's;
 * earlier lots, and every sale costed from them, keep theirs. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const quantity = Number(body?.quantity);
  if (!body || typeof body.productId !== "string" || !(quantity > 0)) {
    return NextResponse.json({ error: "productId and a quantity above 0 are required" }, { status: 400 });
  }
  const costPrice = optionalNumber(body.costPrice);
  const sellPrice = optionalNumber(body.sellPrice);
  if (Number.isNaN(costPrice) || Number.isNaN(sellPrice)) {
    return NextResponse.json({ error: "Cost price and sell price must be numbers (0 or more)" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const lot = await app.container.router.products.refillProduct(
      { productId: body.productId, quantity, costPrice, sellPrice, note: typeof body.note === "string" ? body.note : undefined },
      await resolveAdminActor(req)
    );
    return NextResponse.json(lot);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
