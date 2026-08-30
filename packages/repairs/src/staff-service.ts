import { prisma } from "@ai-chat-platform/database";

export interface StaffMember {
  id: string;
  businessId: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

function toStaff(row: {
  id: string;
  businessId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): StaffMember {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class StaffService {
  async create(input: { businessId: string; name: string; email?: string; phone?: string; role?: string }): Promise<StaffMember> {
    const row = await prisma.staff.create({
      data: {
        businessId: input.businessId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        role: input.role ?? "technician",
      },
    });
    return toStaff(row);
  }

  async listForBusiness(businessId: string): Promise<StaffMember[]> {
    const rows = await prisma.staff.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });
    return rows.map(toStaff);
  }

  async findById(id: string): Promise<StaffMember | null> {
    const row = await prisma.staff.findUnique({ where: { id } });
    return row ? toStaff(row) : null;
  }

  async update(id: string, data: { name?: string; email?: string; phone?: string; role?: string; active?: boolean }): Promise<StaffMember> {
    const row = await prisma.staff.update({ where: { id }, data });
    return toStaff(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.staff.delete({ where: { id } });
  }
}
