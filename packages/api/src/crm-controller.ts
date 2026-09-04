import { ContactService, type UpsertContactInput } from "@ai-chat-platform/crm";

export class CrmController {
  constructor(private readonly contacts: ContactService) {}

  listContacts(businessId?: string) {
    return this.contacts.listForBusiness(businessId);
  }

  upsertContact(input: UpsertContactInput) {
    return this.contacts.upsert(input);
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
}
