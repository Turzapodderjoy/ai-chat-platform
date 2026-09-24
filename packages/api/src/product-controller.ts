import { refillProduct, listProductLots } from "@ai-chat-platform/database";
import { ProductService, ProductSyncService, type CreateProductInput, type UpdateProductInput } from "@ai-chat-platform/product-catalog";
import { prisma } from "@ai-chat-platform/database";

/** The Product Catalog panel's data source — search + offset pagination
 * over the Product table (see ProductSyncService for how it's kept
 * current), plus the owner-facing manual add/edit/delete/import
 * surface for clients tracking their own inventory directly. */
export class ProductController {
  constructor(
    private readonly products: ProductService,
    private readonly productSync: ProductSyncService
  ) {}

  list(businessId: string, search?: string, offset?: number, limit?: number) {
    return this.products.forBusiness(businessId, { search, offset, limit });
  }

  createProduct(input: CreateProductInput) {
    if (!input.name.trim()) {
      throw new Error("Product name is required.");
    }
    return this.products.create(input);
  }

  updateProduct(id: string, input: UpdateProductInput) {
    return this.products.update(id, input);
  }

  /** Restock: adds a lot (quantity + its own cost/sell price). */
  async refillProduct(input: { productId: string; quantity: number; costPrice?: number | null; sellPrice?: number | null; note?: string; locationId?: string }, actorUsername: string) {
    const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { businessId: true } });
    let locationId = input.locationId;
    if (!locationId && product) {
      const loc = await prisma.location.findFirst({ where: { businessId: product.businessId, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
      locationId = loc?.id;
    }
    return refillProduct({ ...input, receivedBy: actorUsername, locationId });
  }

  /** Every lot ever received for a product, newest first -- the cost/price
   * history behind its current cost. */
  listLots(productId: string) {
    return listProductLots(productId);
  }

  deleteProduct(id: string, actorUsername: string) {
    return this.products.delete(id, actorUsername);
  }

  importProducts(businessId: string, fileBuffer: Buffer) {
    return this.productSync.importRows(businessId, fileBuffer);
  }

  /** Manual backfill button for products that existed before image
   * captioning shipped — see ProductSyncService.captionMissingImages's
   * own comment. */
  captionMissingImages(businessId: string) {
    return this.productSync.captionMissingImages(businessId);
  }
}
