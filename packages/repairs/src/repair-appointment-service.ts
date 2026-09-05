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
  isWalkIn?: boolean;
  wantsFreeDiagnosis?: boolean;
  source?: string;
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
  serialNumber?: string;
  contactId?: string;
  items: RepairOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface RepairOrderItem {
  id: string;
  repairAppointmentId: string;
  productId?: string;
  kind: "part" | "service";
  name: string;
  quantity: number;
  defaultPrice: number;
  overridePrice?: number;
  finalPrice: number;
}

export interface AddOrderItemInput {
  productId?: string;
  kind: "part" | "service";
  name: string;
  quantity: number;
  defaultPrice: number;
}

function toItem(row: {
  id: string;
  repairAppointmentId: string;
  productId: string | null;
  kind: string;
  name: string;
  quantity: number;
  defaultPrice: number;
  overridePrice: number | null;
}): RepairOrderItem {
  return {
    id: row.id,
    repairAppointmentId: row.repairAppointmentId,
    productId: row.productId ?? undefined,
    kind: row.kind as "part" | "service",
    name: row.name,
    quantity: row.quantity,
    defaultPrice: row.defaultPrice,
    overridePrice: row.overridePrice ?? undefined,
    finalPrice: row.overridePrice ?? row.defaultPrice * row.quantity,
  };
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
  isWalkIn: boolean;
  wantsFreeDiagnosis: boolean;
  source: string | null;
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
  serialNumber: string | null;
  contactId: string | null;
  items?: Parameters<typeof toItem>[0][];
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
    isWalkIn: row.isWalkIn,
    wantsFreeDiagnosis: row.wantsFreeDiagnosis,
    source: row.source ?? undefined,
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
    serialNumber: row.serialNumber ?? undefined,
    contactId: row.contactId ?? undefined,
    items: (row.items ?? []).map(toItem),
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
        isWalkIn: input.isWalkIn ?? false,
        wantsFreeDiagnosis: input.wantsFreeDiagnosis ?? false,
        source: input.source ?? null,
      },
    });
    return toAppointment(row);
  }

  async findByToken(trackingToken: string): Promise<RepairAppointment | null> {
    const row = await prisma.repairAppointment.findUnique({ where: { trackingToken }, include: { items: true } });
    return row ? toAppointment(row) : null;
  }

  /** businessId omitted returns every business's appointments — same
   * "unscoped means platform-wide" convention as listAllConversations. */
  async listForBusiness(businessId?: string): Promise<RepairAppointment[]> {
    const rows = await prisma.repairAppointment.findMany({
      where: businessId ? { businessId } : {},
      orderBy: { appointmentDate: "desc" },
      include: { items: true },
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

  async assignTechnician(id: string, technicianId: string | null): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({ where: { id }, data: { technicianId } });
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
    const row = await prisma.repairAppointment.findUnique({ where: { id }, include: { items: true } });
    return row ? toAppointment(row) : null;
  }

  async delete(id: string): Promise<void> {
    await prisma.repairAppointment.delete({ where: { id } });
  }

  /** Per-business, per-day sequence ("20260901-001" style) -- same shape
   * as InvoiceService.nextInvoiceNumber's existing sequential pattern.
   * Counts today's appointments that already have a serial number so a
   * gap from a deleted one never gets reused. */
  async nextSerialNumber(businessId: string): Promise<string> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const datePart = startOfDay.toISOString().slice(0, 10).replace(/-/g, "");

    const countToday = await prisma.repairAppointment.count({
      where: { businessId, serialNumber: { startsWith: datePart } },
    });

    return `${datePart}-${String(countToday + 1).padStart(3, "0")}`;
  }

  async setSerialNumber(id: string, serialNumber: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({ where: { id }, data: { serialNumber }, include: { items: true } });
    return toAppointment(row);
  }

  async setContact(id: string, contactId: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({ where: { id }, data: { contactId }, include: { items: true } });
    return toAppointment(row);
  }

  /** Adds a part/service line to a repair order. For a "part" with a
   * productId, decrements that Product's stock by the quantity used --
   * direct adjustment, no reservation/hold system (see this feature's
   * own design notes). Product.stock is a free-text string field (same
   * convention as its `price` field), so this only adjusts it when it
   * parses as a plain number; a non-numeric stock value is left alone
   * rather than silently corrupted. */
  async addItem(repairAppointmentId: string, input: AddOrderItemInput): Promise<RepairOrderItem> {
    // Lazily assigns a serial number on the FIRST item added -- covers
    // both entry points: an order created via createOrderEntry (already
    // has one) and the "Manage Order" button on a normal booking (never
    // had one until now), with no separate "assign serial" step either
    // one needs to remember to call.
    const appointment = await prisma.repairAppointment.findUnique({
      where: { id: repairAppointmentId },
      select: { businessId: true, serialNumber: true },
    });
    if (appointment && !appointment.serialNumber) {
      const serialNumber = await this.nextSerialNumber(appointment.businessId);
      await prisma.repairAppointment.update({ where: { id: repairAppointmentId }, data: { serialNumber } });
    }

    const row = await prisma.repairOrderItem.create({
      data: {
        repairAppointmentId,
        productId: input.productId ?? null,
        kind: input.kind,
        name: input.name,
        quantity: input.quantity,
        defaultPrice: input.defaultPrice,
      },
    });

    if (input.kind === "part" && input.productId) {
      await adjustProductStock(input.productId, -input.quantity);
    }

    return toItem(row);
  }

  async updateItemPrice(itemId: string, overridePrice: number | null): Promise<RepairOrderItem> {
    const row = await prisma.repairOrderItem.update({ where: { id: itemId }, data: { overridePrice } });
    return toItem(row);
  }

  async removeItem(itemId: string): Promise<void> {
    const item = await prisma.repairOrderItem.findUnique({ where: { id: itemId } });
    if (!item) return;

    if (item.kind === "part" && item.productId) {
      await adjustProductStock(item.productId, item.quantity);
    }

    await prisma.repairOrderItem.delete({ where: { id: itemId } });
  }

  totalForAppointment(appointment: RepairAppointment): number {
    return appointment.items.reduce((sum, item) => sum + item.finalPrice, 0);
  }
}

/** delta is negative to consume stock, positive to restore it. Silently
 * no-ops when stock isn't a plain parseable number -- Product.stock is
 * free text by design (see Product's own schema comment), and this
 * feature shouldn't corrupt a value like "12 (backordered)". */
async function adjustProductStock(productId: string, delta: number): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { stock: true } });
  if (!product?.stock) return;

  const current = Number(product.stock);
  if (!Number.isFinite(current)) return;

  await prisma.product.update({ where: { id: productId }, data: { stock: String(current + delta) } });
}
