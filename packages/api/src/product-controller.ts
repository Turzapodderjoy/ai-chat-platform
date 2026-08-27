import { ProductService, ProductSyncService } from "@ai-chat-platform/product-catalog";

/** The Product Catalog panel's data source — search + offset pagination
 * over the Product table (see ProductSyncService for how it's kept
 * current). */
export class ProductController {
  constructor(
    private readonly products: ProductService,
    private readonly productSync: ProductSyncService
  ) {}

  list(businessId: string, search?: string, offset?: number, limit?: number) {
    return this.products.forBusiness(businessId, { search, offset, limit });
  }

  /** Manual backfill button for products that existed before image
   * captioning shipped — see ProductSyncService.captionMissingImages's
   * own comment. */
  captionMissingImages(businessId: string) {
    return this.productSync.captionMissingImages(businessId);
  }
}
