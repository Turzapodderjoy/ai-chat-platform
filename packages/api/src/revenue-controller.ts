import { InvoiceService, PaymentService, type CreateInvoiceInput, type RecordPaymentInput } from "@ai-chat-platform/revenue";

export class RevenueController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly payments: PaymentService
  ) {}

  listInvoices(businessId?: string) {
    return this.invoices.listForBusiness(businessId);
  }

  listInvoicesForContact(contactId: string) {
    return this.invoices.listForContact(contactId);
  }

  createInvoice(input: CreateInvoiceInput) {
    return this.invoices.create(input);
  }

  updateInvoiceStatus(id: string, status: string) {
    return this.invoices.updateStatus(id, status);
  }

  deleteInvoice(id: string) {
    return this.invoices.delete(id);
  }

  recordPayment(input: RecordPaymentInput) {
    return this.payments.record(input);
  }

  deletePayment(id: string) {
    return this.payments.delete(id);
  }
}
