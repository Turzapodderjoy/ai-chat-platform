import { ContactService, DealService, type CreateDealInput } from "@ai-chat-platform/crm";

export class CrmController {
  constructor(
    private readonly contacts: ContactService,
    private readonly deals: DealService
  ) {}

  listContacts(businessId?: string) {
    return this.contacts.listForBusiness(businessId);
  }

  setContactCompany(id: string, companyName: string | null, companyDomain: string | null) {
    return this.contacts.setCompany(id, companyName, companyDomain);
  }

  deleteContact(id: string) {
    return this.contacts.delete(id);
  }

  getContactRecord(id: string) {
    return this.contacts.getRecord(id);
  }

  findContactByPhone(businessId: string, phone: string) {
    return this.contacts.findByPhone(businessId, phone);
  }

  listDeals(businessId?: string) {
    return this.deals.listForBusiness(businessId);
  }

  createDeal(input: CreateDealInput) {
    return this.deals.create(input);
  }

  updateDealStage(id: string, stage: string, lostReason?: string) {
    return this.deals.updateStage(id, stage, lostReason);
  }

  deleteDeal(id: string) {
    return this.deals.delete(id);
  }
}
