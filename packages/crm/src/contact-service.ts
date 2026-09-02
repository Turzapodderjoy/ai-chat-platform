import { prisma } from "@ai-chat-platform/database";

export interface Contact {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  companyDomain: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertContactInput {
  businessId: string;
  name: string;
  phone?: string;
  email?: string;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

function toContact(row: {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  companyDomain: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Contact {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    companyName: row.companyName,
    companyDomain: row.companyDomain,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Real customer records, unifying what ConversationService.
 * namesForConversations already resolves per-conversation (Order/
 * RepairAppointment/pendingOrder name) into one row per person — a
 * customer who orders twice or books a second repair rolls up under
 * the same Contact instead of looking like two different customers. */
export class ContactService {
  /** Matches an existing Contact within the same business by normalized
   * phone or lowercased email (in that order — phone is the more
   * reliable identity signal in this platform's data); falls back to
   * creating a new one. Name is never used as a match key (too many
   * false positives — "Customer", generic placeholders, common names) —
   * only used to fill in / update the record. */
  async upsert(input: UpsertContactInput): Promise<Contact> {
    const phone = input.phone ? normalizePhone(input.phone) : null;
    const email = input.email ? input.email.trim().toLowerCase() : null;

    let existing = null;
    if (phone) {
      existing = await prisma.contact.findFirst({
        where: { businessId: input.businessId, phone: { endsWith: phone.slice(-10) } },
      });
    }
    if (!existing && email) {
      existing = await prisma.contact.findFirst({
        where: { businessId: input.businessId, email },
      });
    }

    if (existing) {
      const row = await prisma.contact.update({
        where: { id: existing.id },
        data: {
          name: existing.name === "Customer" || !existing.name ? input.name : existing.name,
          phone: existing.phone ?? phone,
          email: existing.email ?? email,
        },
      });
      return toContact(row);
    }

    const row = await prisma.contact.create({
      data: { businessId: input.businessId, name: input.name, phone, email },
    });
    return toContact(row);
  }

  async listForBusiness(businessId?: string): Promise<Contact[]> {
    const rows = await prisma.contact.findMany({
      where: businessId ? { businessId } : {},
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toContact);
  }

  async findById(id: string): Promise<Contact | null> {
    const row = await prisma.contact.findUnique({ where: { id } });
    return row ? toContact(row) : null;
  }

  /** Same phone-matching upsert() uses, read-only — how a conversation
   * (which only ever has a phone/externalUserId, never a contactId) is
   * linked to its Contact record in the Inbox detail panel. */
  async findByPhone(businessId: string, phone: string): Promise<Contact | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    const row = await prisma.contact.findFirst({
      where: { businessId, phone: { endsWith: normalized.slice(-10) } },
    });
    return row ? toContact(row) : null;
  }

  async setCompany(id: string, companyName: string | null, companyDomain: string | null): Promise<Contact> {
    const row = await prisma.contact.update({ where: { id }, data: { companyName, companyDomain } });
    return toContact(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.contact.delete({ where: { id } });
  }

  /** The actual "connected record" — every Order and RepairAppointment
   * tied to this person, matched the same way upsert() dedupes them
   * (normalized phone, then email) since neither table carries a
   * contactId FK — they predate Contact and are customer-facing data
   * entered by the AI/customer, not something that should require a
   * schema migration just to link up. */
  async getRecord(id: string): Promise<{
    contact: Contact;
    orders: Array<{ id: string; products: string; paymentMethod: string; createdAt: string }>;
    repairs: Array<{ id: string; trackingToken: string; deviceType: string; status: string; createdAt: string; amountPaid: number; total: number }>;
    quotes: Array<{ id: string; title: string; status: string; total: number; currency: string }>;
    invoices: Array<{ id: string; invoiceNumber: string; status: string; total: number; balanceDue: number; currency: string }>;
    lifetimeValue: number;
  } | null> {
    const row = await prisma.contact.findUnique({ where: { id } });
    if (!row) return null;
    const contact = toContact(row);

    const phoneSuffix = contact.phone ? contact.phone.slice(-10) : null;

    const [orders, repairs, quoteRows, invoiceRows] = await Promise.all([
      phoneSuffix
        ? prisma.order.findMany({
            where: { businessId: contact.businessId, phone: { endsWith: phoneSuffix } },
            orderBy: { createdAt: "desc" },
            select: { id: true, products: true, paymentMethod: true, createdAt: true },
          })
        : Promise.resolve([]),
      phoneSuffix
        ? prisma.repairAppointment.findMany({
            where: { businessId: contact.businessId, phone: { endsWith: phoneSuffix } },
            orderBy: { createdAt: "desc" },
            select: { id: true, trackingToken: true, deviceType: true, status: true, createdAt: true },
          })
        : Promise.resolve([]),
      prisma.quote.findMany({
        where: { contactId: id },
        orderBy: { updatedAt: "desc" },
        include: { items: true },
      }),
      prisma.invoice.findMany({
        where: { contactId: id },
        orderBy: { updatedAt: "desc" },
        include: { items: true },
      }),
    ]);

    // Same subtotal/discount/tax math QuoteService/InvoiceService use —
    // duplicated here (not imported from @ai-chat-platform/revenue) to
    // avoid a circular workspace dependency between crm and revenue.
    const total = (items: { quantity: number; unitPrice: number }[], discount: number, tax: number) =>
      Math.max(0, items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) - discount + tax);

    // Repair jobs bill through an Invoice generated from their items
    // (RepairController.generateInvoice) -- join back by
    // repairAppointmentId to show what was actually charged/paid per
    // job, not just its status.
    const invoiceByRepairId = new Map(
      invoiceRows
        .filter((inv) => inv.repairAppointmentId)
        .map((inv) => [inv.repairAppointmentId as string, { total: total(inv.items, inv.discount, inv.tax), amountPaid: inv.amountPaid }])
    );

    // Customer lifetime value -- real money actually collected (not
    // invoice face value) across every invoice tied to this contact,
    // whether generated from a Quote or a repair order.
    const lifetimeValue = invoiceRows.reduce((sum, inv) => sum + inv.amountPaid, 0);

    return {
      contact,
      orders: orders.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
      repairs: repairs.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        total: invoiceByRepairId.get(r.id)?.total ?? 0,
        amountPaid: invoiceByRepairId.get(r.id)?.amountPaid ?? 0,
      })),
      lifetimeValue,
      quotes: quoteRows.map((q) => ({
        id: q.id,
        title: q.title,
        status: q.status,
        total: total(q.items, q.discount, q.tax),
        currency: q.currency,
      })),
      invoices: invoiceRows.map((inv) => {
        const invTotal = total(inv.items, inv.discount, inv.tax);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          total: invTotal,
          balanceDue: Math.max(0, invTotal - inv.amountPaid),
          currency: inv.currency,
        };
      }),
    };
  }
}
