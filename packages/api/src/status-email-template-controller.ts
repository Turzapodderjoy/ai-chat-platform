import { StatusEmailTemplateService, type StatusEmailKind, type StatusEmailTemplateInput } from "@ai-chat-platform/email";

export class StatusEmailTemplateController {
  constructor(private readonly templates: StatusEmailTemplateService) {}

  listForBusiness(businessId: string) {
    return this.templates.listForBusiness(businessId);
  }

  upsert(businessId: string, kind: StatusEmailKind, statusValue: string, input: StatusEmailTemplateInput) {
    return this.templates.upsert(businessId, kind, statusValue, input);
  }

  delete(id: string) {
    return this.templates.delete(id);
  }
}
