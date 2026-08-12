import { prisma } from "@ai-chat-platform/database";

export interface ProductRecord {
  id: string;
  name: string;
  price: string | null;
  description: string | null;
  stock: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  sku: string | null;
  updatedAt: string;
}

export interface ProductPage {
  products: ProductRecord[];
  total: number;
}

/** Read side of the Product table — the browsable catalog UI's data
 * source. Plain indexed SQL (see ProductSyncService's own comment on why
 * this table exists at all): no embedding, no LLM call, just
 * name/description ILIKE + offset pagination. */
export class ProductService {
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
      products: rows.map((r) => ({
        id: r.id,
        name: r.name,
        price: r.price,
        description: r.description,
        stock: r.stock,
        imageUrl: r.imageUrl,
        sourceUrl: r.sourceUrl,
        sku: r.sku,
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
    };
  }
}
