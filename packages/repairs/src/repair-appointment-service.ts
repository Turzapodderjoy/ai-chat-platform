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
  priority: string;
  technicianId?: string;
  deviceImages: string[];
  rescheduleRequested: boolean;
  rescheduleNewDate?: Date;
  cancelRequested: boolean;
  cancelReason?: string;
  estimatedCost?: number;
  actualCost?: number;
  warrantyExpiry?: Date;
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
  priority: string;
  technicianId: string | null;
  deviceImages: string[];
  rescheduleRequested: boolean;
  rescheduleNewDate: Date | null;
  cancelRequested: boolean;
  cancelReason: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  warrantyExpiry: Date | null;
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
    priority: row.priority,
    technicianId: row.technicianId ?? undefined,
    deviceImages: row.deviceImages ?? [],
    rescheduleRequested: row.rescheduleRequested,
    rescheduleNewDate: row.rescheduleNewDate ?? undefined,
    cancelRequested: row.cancelRequested,
    cancelReason: row.cancelReason ?? undefined,
    estimatedCost: row.estimatedCost ?? undefined,
    actualCost: row.actualCost ?? undefined,
    warrantyExpiry: row.warrantyExpiry ?? undefined,
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

  async updatePriority(id: string, priority: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({ where: { id }, data: { priority } });
    return toAppointment(row);
  }

  async updateDate(id: string, date: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({ where: { id }, data: { appointmentDate: new Date(date) } });
    return toAppointment(row);
  }

  async updatePhotos(id: string, images: string[]): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({ where: { id }, data: { deviceImages: images } });
    return toAppointment(row);
  }

  async requestReschedule(id: string, newDate: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({
      where: { id },
      data: { rescheduleRequested: true, rescheduleNewDate: new Date(newDate) },
    });
    return toAppointment(row);
  }

  async approveReschedule(id: string): Promise<RepairAppointment> {
    const appointment = await this.findById(id);
    if (!appointment) throw new Error("Appointment not found");
    const row = await prisma.repairAppointment.update({
      where: { id },
      data: {
        appointmentDate: appointment.rescheduleNewDate!,
        rescheduleRequested: false,
        rescheduleNewDate: null,
      },
    });
    return toAppointment(row);
  }

  async rejectReschedule(id: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({
      where: { id },
      data: { rescheduleRequested: false, rescheduleNewDate: null },
    });
    return toAppointment(row);
  }

  async requestCancel(id: string, reason?: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({
      where: { id },
      data: { cancelRequested: true, cancelReason: reason ?? null },
    });
    return toAppointment(row);
  }

  async approveCancel(id: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({
      where: { id },
      data: { status: "cancelled", cancelRequested: false },
    });
    return toAppointment(row);
  }

  async rejectCancel(id: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({
      where: { id },
      data: { cancelRequested: false, cancelReason: null },
    });
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
