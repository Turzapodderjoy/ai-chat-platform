import { QuoteService, InvoiceService, PaymentService, type CreateQuoteInput, type CreateInvoiceInput, type RecordPaymentInput } from "@ai-chat-platform/revenue";

export class RevenueController {
  constructor(
    private readonly quotes: QuoteService,
    private readonly invoices: InvoiceService,
    private readonly payments: PaymentService
  ) {}

  listQuotes(businessId?: string) {
    return this.quotes.listForBusiness(businessId);
  }

  listQuotesForContact(contactId: string) {
    return this.quotes.listForContact(contactId);
  }

  createQuote(input: CreateQuoteInput) {
    return this.quotes.create(input);
  }

  updateQuoteStatus(id: string, status: string) {
    return this.quotes.updateStatus(id, status);
  }

  deleteQuote(id: string) {
    return this.quotes.delete(id);
  }

  listInvoices(businessId?: string) {
    return this.invoices.listForBusiness(businessId);
  }

  listInvoicesForContact(contactId: string) {
    return this.invoices.listForContact(contactId);
  }

  createInvoice(input: CreateInvoiceInput) {
    return this.invoices.create(input);
  }

  generateInvoiceFromQuote(quoteId: string, dueDate?: string) {
    return this.invoices.generateFromQuote(quoteId, dueDate);
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
