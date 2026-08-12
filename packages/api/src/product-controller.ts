import { ProductService } from "@ai-chat-platform/product-catalog";

/** The Product Catalog panel's data source — search + offset pagination
 * over the Product table (see ProductSyncService for how it's kept
 * current). */
export class ProductController {
  constructor(private readonly products: ProductService) {}

  list(businessId: string, search?: string, offset?: number, limit?: number) {
    return this.products.forBusiness(businessId, { search, offset, limit });
  }
}
