import { OfferService, type CreateOfferInput } from "@ai-chat-platform/offers";

export class OfferController {
  constructor(private readonly offers: OfferService) {}

  listForBusiness(businessId: string) {
    return this.offers.listForBusiness(businessId);
  }

  create(input: CreateOfferInput) {
    return this.offers.create(input);
  }

  update(id: string, data: Partial<CreateOfferInput> & { isActive?: boolean }) {
    return this.offers.update(id, data);
  }

  delete(id: string) {
    return this.offers.delete(id);
  }

  validate(businessId: string, code: string) {
    return this.offers.validate(businessId, code);
  }
}
