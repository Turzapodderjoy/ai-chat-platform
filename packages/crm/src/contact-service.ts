import { prisma } from "@ai-chat-platform/database";

export interface Contact {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyId: string | null;
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
  companyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Contact {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    companyId: row.companyId,
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

  async setCompany(id: string, companyId: string | null): Promise<Contact> {
    const row = await prisma.contact.update({ where: { id }, data: { companyId } });
    return toContact(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.contact.delete({ where: { id } });
  }
}
