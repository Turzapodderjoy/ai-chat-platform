import { ProductService, ProductSyncService, type CreateProductInput, type UpdateProductInput } from "@ai-chat-platform/product-catalog";

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

  deleteProduct(id: string) {
    return this.products.delete(id);
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
