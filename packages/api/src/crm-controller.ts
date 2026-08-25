import { ContactService, CompanyService, DealService, type CreateDealInput } from "@ai-chat-platform/crm";

export class CrmController {
  constructor(
    private readonly contacts: ContactService,
    private readonly companies: CompanyService,
    private readonly deals: DealService
  ) {}

  listContacts(businessId?: string) {
    return this.contacts.listForBusiness(businessId);
  }

  setContactCompany(id: string, companyId: string | null) {
    return this.contacts.setCompany(id, companyId);
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

  listCompanies(businessId?: string) {
    return this.companies.listForBusiness(businessId);
  }

  createCompany(businessId: string, name: string, domain?: string) {
    return this.companies.create(businessId, name, domain);
  }

  deleteCompany(id: string) {
    return this.companies.delete(id);
  }

  listDeals(businessId?: string) {
    return this.deals.listForBusiness(businessId);
  }

  createDeal(input: CreateDealInput) {
    return this.deals.create(input);
  }

  updateDealStage(id: string, stage: string) {
    return this.deals.updateStage(id, stage);
  }

  deleteDeal(id: string) {
    return this.deals.delete(id);
  }
}
