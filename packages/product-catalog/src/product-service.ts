import { prisma } from "@ai-chat-platform/database";

export interface ProductRecord {
  id: string;
  name: string;
  price: string | null;
  costPrice: string | null;
  tier: string;
  description: string | null;
  stock: string | null;
  category: string | null;
  minStock: number;
  imageUrl: string | null;
  sourceUrl: string | null;
  sku: string | null;
  updatedAt: string;
}

export interface ProductPage {
  products: ProductRecord[];
  total: number;
}

export interface CreateProductInput {
  businessId: string;
  name: string;
  price?: string | null;
  costPrice?: string | null;
  tier?: string;
  stock?: string | null;
  category?: string | null;
  minStock?: string | number | null;
  sku?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

export interface UpdateProductInput {
  name?: string;
  price?: string | null;
  costPrice?: string | null;
  tier?: string;
  stock?: string | null;
  category?: string | null;
  minStock?: string | number | null;
  sku?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

// minStock arrives from the UI as a string (every form input is a
// string) but the column is a real Int -- Prisma rejects a string value
// outright, which used to fail the whole update silently (the request
// errored, the UI just left the edit row open with no explanation).
function toMinStock(v: string | number | null | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = typeof v === "number" ? v : parseInt(v ?? "", 10);
  return isNaN(n) ? undefined : n;
}

/** Read side of the Product table — the browsable catalog UI's data
 * source. Plain indexed SQL (see ProductSyncService's own comment on why
 * this table exists at all): no embedding, no LLM call, just
 * name/description ILIKE + offset pagination.
 *
 * Also the owner-facing write side (manual add/edit/delete, plus bulk
 * CSV/XLSX import in ProductSyncService.importRows) — for a client who
 * wants to track inventory directly rather than only via crawled-site
 * sync. These rows are NOT indexed into the vector store/chat retrieval
 * pipeline (that stays crawl/upload-only, see Knowledge Hub) — this is
 * purely the inventory record, same as the existing read-only catalog
 * view already was. */
export class ProductService {
  async create(input: CreateProductInput): Promise<ProductRecord> {
    const row = await prisma.product.create({
      data: {
        businessId: input.businessId,
        name: input.name,
        price: input.price ?? null,
        costPrice: input.costPrice ?? null,
        tier: input.tier ?? "regular",
        stock: input.stock ?? null,
        category: input.category ?? null,
        minStock: toMinStock(input.minStock) ?? 0,
        sku: input.sku ?? null,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
      },
    });
    return this.toRecord(row);
  }

  async update(id: string, input: UpdateProductInput): Promise<ProductRecord> {
    const row = await prisma.product.update({
      where: { id },
      data: { ...input, minStock: toMinStock(input.minStock) },
    });
    return this.toRecord(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.product.delete({ where: { id } });
  }

  private toRecord(r: {
    id: string;
    name: string;
    price: string | null;
    costPrice: string | null;
    tier: string;
    description: string | null;
    stock: string | null;
    category: string | null;
    minStock: number;
    imageUrl: string | null;
    sourceUrl: string | null;
    sku: string | null;
    updatedAt: Date;
  }): ProductRecord {
    return {
      id: r.id,
      name: r.name,
      price: r.price,
      costPrice: r.costPrice,
      tier: r.tier,
      description: r.description,
      stock: r.stock,
      category: r.category,
      minStock: r.minStock,
      imageUrl: r.imageUrl,
      sourceUrl: r.sourceUrl,
      sku: r.sku,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async forBusiness(
    businessId: string,
    options: { search?: string; offset?: number; limit?: number } = {}
  ): Promise<ProductPage> {
    const search = options.search?.trim();
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 25;

    const where = {
      businessId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
              { sku: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy: { updatedAt: "desc" }, skip: offset, take: limit }),
      prisma.product.count({ where }),
    ]);

    return {
      products: rows.map((r) => this.toRecord(r)),
      total,
    };
  }
}
