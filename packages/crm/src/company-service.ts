import { prisma } from "@ai-chat-platform/database";

export interface Company {
  id: string;
  businessId: string;
  name: string;
  domain: string | null;
  createdAt: string;
}

function toCompany(row: { id: string; businessId: string; name: string; domain: string | null; createdAt: Date }): Company {
  return { id: row.id, businessId: row.businessId, name: row.name, domain: row.domain, createdAt: row.createdAt.toISOString() };
}

export class CompanyService {
  async create(businessId: string, name: string, domain?: string): Promise<Company> {
    const row = await prisma.company.create({ data: { businessId, name, domain: domain || null } });
    return toCompany(row);
  }

  async listForBusiness(businessId?: string): Promise<Company[]> {
    const rows = await prisma.company.findMany({
      where: businessId ? { businessId } : {},
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toCompany);
  }

  async delete(id: string): Promise<void> {
    await prisma.company.delete({ where: { id } });
  }
}
