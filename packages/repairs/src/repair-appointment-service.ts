import { randomInt } from "node:crypto";

import { prisma } from "@ai-chat-platform/database";

export interface RepairAppointmentInput {
  businessId: string;
  trackingToken: string;
  customerName: string;
  phone: string;
  email?: string;
  deviceType: string;
  deviceModel?: string;
  issueDescription: string;
  appointmentDate: Date;
}

export interface RepairAppointment extends RepairAppointmentInput {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Unambiguous over the phone/screen — no 0/O or 1/I to misread or
// mistype. 8 chars from a 32-symbol alphabet is ~1 trillion possible
// codes; the retry loop in generateTrackingToken is just a safety net,
// not something expected to actually fire.
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomToken(): string {
  let token = "";
  for (let i = 0; i < 8; i++) {
    token += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }
  return token;
}

function toAppointment(row: {
  id: string;
  businessId: string;
  trackingToken: string;
  customerName: string;
  phone: string;
  email: string | null;
  deviceType: string;
  deviceModel: string | null;
  issueDescription: string;
  appointmentDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): RepairAppointment {
  return {
    id: row.id,
    businessId: row.businessId,
    trackingToken: row.trackingToken,
    customerName: row.customerName,
    phone: row.phone,
    email: row.email ?? undefined,
    deviceType: row.deviceType,
    deviceModel: row.deviceModel ?? undefined,
    issueDescription: row.issueDescription,
    appointmentDate: row.appointmentDate,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Appointment booking + repair-progress tracking for a client that has
 * no AI bot at all (see RepairController, which owns creating the linked
 * Conversation) — same flat, human-readable-slip scope as OrderService. */
export class RepairAppointmentService {
  /** Collision retry against the @unique constraint — see TOKEN_ALPHABET's
   * comment for why a collision is vanishingly unlikely in practice. */
  async generateTrackingToken(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = randomToken();
      const existing = await prisma.repairAppointment.findUnique({ where: { trackingToken: token } });
      if (!existing) return token;
    }
    throw new Error("Could not generate a unique tracking token");
  }

  async book(input: Omit<RepairAppointmentInput, "trackingToken"> & { trackingToken: string }): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.create({
      data: {
        businessId: input.businessId,
        trackingToken: input.trackingToken,
        customerName: input.customerName,
        phone: input.phone,
        email: input.email ?? null,
        deviceType: input.deviceType,
        deviceModel: input.deviceModel ?? null,
        issueDescription: input.issueDescription,
        appointmentDate: input.appointmentDate,
      },
    });
    return toAppointment(row);
  }

  async findByToken(trackingToken: string): Promise<RepairAppointment | null> {
    const row = await prisma.repairAppointment.findUnique({ where: { trackingToken } });
    return row ? toAppointment(row) : null;
  }

  /** businessId omitted returns every business's appointments — same
   * "unscoped means platform-wide" convention as listAllConversations. */
  async listForBusiness(businessId?: string): Promise<RepairAppointment[]> {
    const rows = await prisma.repairAppointment.findMany({
      where: businessId ? { businessId } : {},
      orderBy: { appointmentDate: "desc" },
    });
    return rows.map(toAppointment);
  }

  async updateStatus(id: string, status: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({ where: { id }, data: { status } });
    return toAppointment(row);
  }

  async findById(id: string): Promise<RepairAppointment | null> {
    const row = await prisma.repairAppointment.findUnique({ where: { id } });
    return row ? toAppointment(row) : null;
  }

  async delete(id: string): Promise<void> {
    await prisma.repairAppointment.delete({ where: { id } });
  }
}
