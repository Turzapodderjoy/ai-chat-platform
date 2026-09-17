import { InvoiceService, PaymentService, generateInvoicePdf, type CreateInvoiceInput, type UpdateInvoiceInput, type RecordPaymentInput } from "@ai-chat-platform/revenue";
import type { ContactService } from "@ai-chat-platform/crm";
import type { RepairAppointmentService } from "@ai-chat-platform/repairs";
import type { TenantService } from "@ai-chat-platform/tenant";
import type { GmailEmailClient } from "@ai-chat-platform/email";

// Same mapping as apps/web/lib/currency.ts's currencySymbol -- kept as
// a tiny local copy rather than a new shared package for one 3-entry
// map used only when rendering the emailed PDF.
const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", BDT: "৳", EUR: "€" };
function currencySymbol(code: string | null | undefined): string {
  return CURRENCY_SYMBOLS[code || "USD"] || (code ? `${code} ` : "$");
}

export class RevenueController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly payments: PaymentService,
    private readonly contacts: ContactService,
    private readonly repairs: RepairAppointmentService,
    private readonly tenants: TenantService,
    private readonly gmail: GmailEmailClient
  ) {}

  listInvoices(businessId?: string) {
    return this.invoices.listForBusiness(businessId);
  }

  listInvoicesForContact(contactId: string) {
    return this.invoices.listForContact(contactId);
  }

  getInvoice(id: string) {
    return this.invoices.get(id);
  }

  /** Everything the print view needs in one call: the invoice itself
   * plus the business name/currency and whichever of contact/order
   * actually has the customer's details -- same lookups sendInvoiceEmail
   * does, just returned instead of used to send. */
  async getInvoiceDetail(id: string) {
    const invoice = await this.invoices.get(id);
    if (!invoice) return null;

    const [contact, appointment, business] = await Promise.all([
      invoice.contactId ? this.contacts.findById(invoice.contactId) : Promise.resolve(null),
      invoice.repairAppointmentId ? this.repairs.findById(invoice.repairAppointmentId) : Promise.resolve(null),
      this.tenants.getBusiness(invoice.businessId),
    ]);

    return {
      invoice,
      businessName: business?.name ?? "",
      logoUrl: business?.logoUrl ?? null,
      // The business's CURRENT currency, not invoice.currency -- that's
      // whatever was set when the invoice was created and goes stale
      // forever if the business switches currencies later (same drift
      // bug already fixed on the Invoices/Contacts panels).
      currencySymbol: currencySymbol(business?.subscriptionCurrency),
      timezone: business?.timezone ?? "America/New_York",
      customerName: contact?.name ?? appointment?.customerName ?? null,
      customerPhone: contact?.phone ?? appointment?.phone ?? null,
      customerEmail: contact?.email ?? appointment?.email ?? null,
      deviceLabel: appointment ? `${appointment.deviceType}${appointment.deviceModel ? ` (${appointment.deviceModel})` : ""}` : null,
    };
  }

  createInvoice(input: CreateInvoiceInput, actorUsername: string) {
    return this.invoices.create(input, actorUsername);
  }

  updateInvoice(id: string, input: UpdateInvoiceInput, actorUsername: string) {
    return this.invoices.update(id, input, actorUsername);
  }

  updateInvoiceStatus(id: string, status: string, actorUsername: string) {
    return this.invoices.updateStatus(id, status, actorUsername);
  }

  deleteInvoice(id: string, actorUsername: string) {
    return this.invoices.delete(id, actorUsername);
  }

  recordPayment(input: RecordPaymentInput) {
    return this.payments.record(input);
  }

  setInvoiceAmounts(invoiceId: string, businessId: string, input: { total?: number; paidAmount?: number }, actorUsername: string) {
    return this.payments.setAmounts(invoiceId, businessId, input, actorUsername);
  }

  deletePayment(id: string, actorUsername: string) {
    return this.payments.delete(id, actorUsername);
  }

  /** The Invoices panel's "Send" button -- generates the invoice PDF
   * fresh (never cached/stored) and emails it via the business's
   * connected Gmail account. Recipient is the linked Contact's email
   * first, falling back to the linked repair order's own email field
   * (a manually-added invoice with no Contact still often has one via
   * its order) -- never invented from scratch, and never sent to
   * nobody. Explicit action only, per the project owner: nothing here
   * fires automatically off a status change or the print action. */
  async sendInvoiceEmail(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
    const detail = await this.getInvoiceDetail(invoiceId);
    if (!detail) return { ok: false, error: "Invoice not found" };
    if (!detail.customerEmail) return { ok: false, error: "This customer has no email on file (checked the invoice's contact and its linked order)." };

    const pdf = await generateInvoicePdf(detail.invoice, {
      businessName: detail.businessName,
      currencySymbol: detail.currencySymbol,
      customerName: detail.customerName ?? undefined,
      customerPhone: detail.customerPhone ?? undefined,
      customerEmail: detail.customerEmail,
      deviceLabel: detail.deviceLabel ?? undefined,
      timezone: detail.timezone,
    });

    const result = await this.gmail.send(detail.invoice.businessId, {
      to: detail.customerEmail,
      subject: `Invoice ${detail.invoice.invoiceNumber} from ${detail.businessName}`,
      html: `<p>Hi ${detail.customerName ?? "there"},</p><p>Please find attached invoice <strong>${detail.invoice.invoiceNumber}</strong> from ${detail.businessName}.</p>`,
      attachments: [{ filename: `${detail.invoice.invoiceNumber}.pdf`, content: pdf, contentType: "application/pdf" }],
    });

    if (!result.ok) {
      return { ok: false, error: result.error === "not_connected" ? "This business hasn't connected a Gmail account yet (Integrations panel)." : result.error };
    }
    return { ok: true };
  }
}
