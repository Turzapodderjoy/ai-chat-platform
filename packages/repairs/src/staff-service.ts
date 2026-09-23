import { prisma, archiveDeleted } from "@ai-chat-platform/database";

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

export interface TimeEntry {
  id: string;
  businessId: string;
  staffId: string;
  clockIn: string;
  clockOut: string | null;
  note: string | null;
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

function toTimeEntry(row: {
  id: string;
  businessId: string;
  staffId: string;
  clockIn: Date;
  clockOut: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TimeEntry {
  return {
    id: row.id,
    businessId: row.businessId,
    staffId: row.staffId,
    clockIn: row.clockIn.toISOString(),
    clockOut: row.clockOut?.toISOString() ?? null,
    note: row.note ?? null,
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
    const row = await prisma.staff.findUnique({ where: { id: id } });
    if (row) {
      await archiveDeleted({ businessId: row.businessId, entityType: "staff", entityId: id, label: row.name, data: row, deletedBy: "not recorded" });
    }
    await prisma.staff.delete({ where: { id } });
  }

  // Time clock
  async clockIn(businessId: string, staffId: string, note?: string): Promise<TimeEntry> {
    const open = await prisma.timeEntry.findFirst({
      where: { businessId, staffId, clockOut: null },
    });
    if (open) throw new Error("Already clocked in");
    const row = await prisma.timeEntry.create({
      data: { businessId, staffId, clockIn: new Date(), note: note ?? null },
    });
    return toTimeEntry(row);
  }

  async clockOut(businessId: string, staffId: string, note?: string): Promise<TimeEntry> {
    const open = await prisma.timeEntry.findFirst({
      where: { businessId, staffId, clockOut: null },
      orderBy: { clockIn: "desc" },
    });
    if (!open) throw new Error("No active clock-in found");
    const row = await prisma.timeEntry.update({
      where: { id: open.id },
      data: { clockOut: new Date(), note: note ?? open.note },
    });
    return toTimeEntry(row);
  }

  async getCurrentShift(businessId: string, staffId: string): Promise<TimeEntry | null> {
    const open = await prisma.timeEntry.findFirst({
      where: { businessId, staffId, clockOut: null },
      orderBy: { clockIn: "desc" },
    });
    return open ? toTimeEntry(open) : null;
  }

  async listTimeEntries(businessId: string, staffId?: string, from?: Date, to?: Date): Promise<TimeEntry[]> {
    const where: any = { businessId };
    if (staffId) where.staffId = staffId;
    if (from || to) {
      where.clockIn = {};
      if (from) where.clockIn.gte = from;
      if (to) where.clockIn.lte = to;
    }
    const rows = await prisma.timeEntry.findMany({
      where,
      orderBy: { clockIn: "desc" },
      take: 500,
    });
    return rows.map(toTimeEntry);
  }
}
