import { Prisma, prisma } from "./client";

/** Where a sold/used quantity came from: one entry per lot it drew on.
 * lotId null = beyond every recorded lot (sold below zero, or free-text
 * stock) -- costed at the product's then-current cost. */
export interface LotAllocation {
  lotId: string | null;
  quantity: number;
  unitCost: number | null;
}

type Tx = Prisma.TransactionClient;

const toNum = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Weighted unit cost across the lots a quantity was drawn from -- what a
 * line's cost snapshot stores, so a later restock at a different price
 * never rewrites what an earlier sale cost. null when no cost is known. */
export function weightedUnitCost(allocations: LotAllocation[]): number | null {
  const priced = allocations.filter((a) => a.unitCost !== null);
  const qty = priced.reduce((s, a) => s + a.quantity, 0);
  if (qty <= 0) return null;
  return priced.reduce((s, a) => s + a.quantity * (a.unitCost as number), 0) / qty;
}

/** Stock that existed before lot tracking (or was typed in by hand) has no
 * lot behind it yet -- give it one, at the product's current cost/price,
 * the first time anything touches it. */
async function ensureOpeningLot(tx: Tx, product: { id: string; businessId: string; stock: string | null; costPrice: string | null; price: string | null }) {
  if ((await tx.productLot.count({ where: { productId: product.id } })) > 0) return;
  const stock = toNum(product.stock);
  if (stock === null || stock <= 0) return;
  await tx.productLot.create({
    data: {
      businessId: product.businessId,
      productId: product.id,
      quantity: stock,
      remaining: stock,
      costPrice: toNum(product.costPrice),
      sellPrice: toNum(product.price),
      receivedBy: "opening balance",
      note: "Stock on hand before lot tracking began",
    },
  });
}

/** Take `quantity` units out of stock, oldest lot first. Product.stock is
 * a free-text field by design (see its schema comment): when it isn't a
 * plain number nothing is tracked and this only reports the current cost,
 * same as the old adjustProductStock no-op. */
export async function consumeStock(productId: string, quantity: number): Promise<{ unitCost: number | null; allocations: LotAllocation[] }> {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) return { unitCost: null, allocations: [] };
    const stock = toNum(product.stock);
    const liveCost = toNum(product.costPrice);
    if (stock === null) return { unitCost: liveCost, allocations: [] };

    await ensureOpeningLot(tx, product);
    const lots = await tx.productLot.findMany({ where: { productId, remaining: { gt: 0 } }, orderBy: [{ receivedAt: "asc" }, { id: "asc" }] });

    let need = quantity;
    const allocations: LotAllocation[] = [];
    for (const lot of lots) {
      if (need <= 0) break;
      const take = Math.min(need, lot.remaining);
      await tx.productLot.update({ where: { id: lot.id }, data: { remaining: lot.remaining - take } });
      allocations.push({ lotId: lot.id, quantity: take, unitCost: lot.costPrice });
      need -= take;
    }
    if (need > 0) allocations.push({ lotId: null, quantity: need, unitCost: liveCost });

    await tx.product.update({ where: { id: productId }, data: { stock: String(stock - quantity) } });
    return { unitCost: weightedUnitCost(allocations), allocations };
  });
}

/** Put units back into the lots they were taken from (a removed order
 * item, a deleted appointment or invoice). A line from before lot tracking
 * has no allocations -- its units go to the newest lot instead. */
export async function restoreStock(productId: string, allocations: LotAllocation[] | null | undefined, quantity: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) return;
    const stock = toNum(product.stock);
    if (stock === null) return;

    const tracked = (allocations ?? []).filter((a) => a.lotId);
    if (tracked.length > 0) {
      for (const a of tracked) {
        const lot = await tx.productLot.findUnique({ where: { id: a.lotId as string } });
        if (lot) await tx.productLot.update({ where: { id: lot.id }, data: { remaining: lot.remaining + a.quantity } });
      }
    } else {
      const newest = await tx.productLot.findFirst({ where: { productId }, orderBy: [{ receivedAt: "desc" }, { id: "desc" }] });
      if (newest) {
        await tx.productLot.update({ where: { id: newest.id }, data: { remaining: newest.remaining + quantity } });
      } else if (stock + quantity > 0) {
        await tx.productLot.create({
          data: { businessId: product.businessId, productId, quantity: stock + quantity, remaining: stock + quantity, costPrice: toNum(product.costPrice), sellPrice: toNum(product.price), receivedBy: "opening balance", note: "Stock on hand before lot tracking began" },
        });
      }
    }
    await tx.product.update({ where: { id: productId }, data: { stock: String(stock + quantity) } });
  });
}

/** Restock: a new lot with its own quantity, cost and sell price. Cost and
 * sell price are optional ("if there") -- left out, the lot inherits the
 * product's current values. The product's current cost/price move to the
 * new lot's; earlier lots, and every sale already costed from them, keep
 * theirs. */
export async function refillProduct(input: {
  productId: string;
  quantity: number;
  costPrice?: number | null;
  sellPrice?: number | null;
  note?: string;
  receivedBy: string;
}) {
  if (!(input.quantity > 0)) throw new Error("Quantity must be more than 0.");
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new Error("Product not found.");
    await ensureOpeningLot(tx, product);

    const cost = input.costPrice ?? toNum(product.costPrice);
    const sell = input.sellPrice ?? toNum(product.price);
    const lot = await tx.productLot.create({
      data: {
        businessId: product.businessId,
        productId: product.id,
        quantity: input.quantity,
        remaining: input.quantity,
        costPrice: cost,
        sellPrice: sell,
        receivedBy: input.receivedBy,
        note: input.note?.trim() || null,
      },
    });
    const stock = toNum(product.stock) ?? 0;
    await tx.product.update({
      where: { id: product.id },
      data: {
        stock: String(stock + input.quantity),
        ...(input.costPrice != null ? { costPrice: String(input.costPrice) } : {}),
        ...(input.sellPrice != null ? { price: String(input.sellPrice) } : {}),
      },
    });
    return { ...lot, receivedAt: lot.receivedAt.toISOString() };
  });
}

/** After Product.stock was edited directly (Inventory table / import),
 * bring the lots back in line with it: extra units become an "edited
 * directly" lot, missing units come off the oldest lots. No-op for a
 * product with no lots yet -- its opening lot is created from the current
 * stock the first time anything uses it. */
export async function reconcileLotsToStock(productId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) return;
    const stock = toNum(product.stock);
    if (stock === null) return;
    const lots = await tx.productLot.findMany({ where: { productId }, orderBy: [{ receivedAt: "asc" }, { id: "asc" }] });
    if (lots.length === 0) return;

    const sum = lots.reduce((s, l) => s + l.remaining, 0);
    const diff = stock - sum;
    if (Math.abs(diff) < 1e-9) return;
    if (diff > 0) {
      await tx.productLot.create({
        data: { businessId: product.businessId, productId, quantity: diff, remaining: diff, costPrice: toNum(product.costPrice), sellPrice: toNum(product.price), receivedBy: "manual stock edit", note: "Stock changed directly in Inventory" },
      });
      return;
    }
    let cut = -diff;
    for (const lot of lots) {
      if (cut <= 0) break;
      const take = Math.min(cut, lot.remaining);
      if (take > 0) await tx.productLot.update({ where: { id: lot.id }, data: { remaining: lot.remaining - take } });
      cut -= take;
    }
  });
}

export async function listProductLots(productId: string) {
  const lots = await prisma.productLot.findMany({ where: { productId }, orderBy: [{ receivedAt: "desc" }, { id: "desc" }] });
  return lots.map((l) => ({ ...l, receivedAt: l.receivedAt.toISOString() }));
}
