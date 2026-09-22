import { randomInt } from "node:crypto";

import { prisma, logAudit, archiveDeleted, nextDocumentNumber, consumeStock, restoreStock, type LotAllocation } from "@ai-chat-platform/database";

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
  totalOverride?: number;
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
  // Only meaningful (and only ever settable) for a custom item with no
  // productId -- an inventory-linked item's cost always comes live from
  // Product.costPrice instead. Never shown to the customer.
  costPrice?: number;
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
  totalOverride: number | null;
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
    totalOverride: row.totalOverride ?? undefined,
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
        // Every appointment -- website form, walk-in, dashboard order, AI
        // chat -- gets its number here, once, from the business's shared
        // sequence; the order # and invoice # are this same value.
        serialNumber: await nextDocumentNumber(input.businessId),
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

  async updateStatus(id: string, status: string, actorUsername: string): Promise<RepairAppointment> {
    const before = await prisma.repairAppointment.findUnique({ where: { id }, select: { businessId: true, status: true } });
    const row = await prisma.repairAppointment.update({ where: { id }, data: { status } });
    if (before) {
      await logAudit({ businessId: before.businessId, entityType: "repair", entityId: id, action: "status_changed", detail: `${before.status} -> ${status}`, actorUsername });
    }
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

  async approveCancel(id: string, actorUsername: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({
      where: { id },
      data: { status: "cancelled", cancelRequested: false },
    });
    await logAudit({ businessId: row.businessId, entityType: "repair", entityId: id, action: "status_changed", detail: "cancel approved", actorUsername });
    return toAppointment(row);
  }

  async rejectCancel(id: string, actorUsername: string): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({
      where: { id },
      data: { cancelRequested: false, cancelReason: null },
    });
    await logAudit({ businessId: row.businessId, entityType: "repair", entityId: id, action: "status_changed", detail: "cancel rejected", actorUsername });
    return toAppointment(row);
  }

  async findById(id: string): Promise<RepairAppointment | null> {
    const row = await prisma.repairAppointment.findUnique({ where: { id }, include: { items: true } });
    return row ? toAppointment(row) : null;
  }

  async delete(id: string, actorUsername: string): Promise<void> {
    const row = await prisma.repairAppointment.findUnique({
      where: { id },
      select: { businessId: true, customerName: true, items: { select: { kind: true, productId: true, quantity: true, lotAllocations: true } } },
    });
    // Deleting the appointment cascades its RepairOrderItem rows, but that
    // cascade never ran the same stock-restoration removeItem() does --
    // confirmed live, deleting an order with parts attached left Inventory
    // permanently short. Restore each part's stock before the delete.
    if (row) {
      for (const item of row.items) {
        if (item.kind === "part" && item.productId) {
          await restoreStock(item.productId, item.lotAllocations as LotAllocation[] | null, item.quantity);
        }
      }
    }
    await prisma.repairAppointment.delete({ where: { id } });
    if (row) {
      await logAudit({ businessId: row.businessId, entityType: "repair", entityId: id, action: "deleted", detail: row.customerName, actorUsername });
    }
  }


  /** Mirrors the linked Invoice's "Paid" override -- so the order's own
   * total (see OrderManagementPanel's orderTotal()) matches what was
   * actually recorded as paid, not the stale itemized sum. */
  async setTotalOverride(id: string, totalOverride: number): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({ where: { id }, data: { totalOverride }, include: { items: true } });
    return toAppointment(row);
  }

  /** Persists the live-edited receipt fields from the "Mark Received"
   *  print popup -- customer/device/issue details and the total override
   *  all apply back to the repair appointment itself. */
  async updateDetails(
    id: string,
    data: { customerName?: string; phone?: string; email?: string; deviceType?: string; deviceModel?: string; issueDescription?: string; totalOverride?: number | null },
    actorUsername: string
  ): Promise<RepairAppointment> {
    const row = await prisma.repairAppointment.update({
      where: { id },
      data: {
        customerName: data.customerName,
        phone: data.phone,
        email: data.email,
        deviceType: data.deviceType,
        deviceModel: data.deviceModel,
        issueDescription: data.issueDescription,
        totalOverride: data.totalOverride === undefined ? undefined : data.totalOverride,
      },
      include: { items: true },
    });
    await logAudit({ businessId: row.businessId, entityType: "repair", entityId: id, action: "details_updated", detail: "Receipt/sticker edits applied", actorUsername });
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
   * rather than silently corrupted.
   *
   * For a manual part (no productId), looks up an existing inventory
   * Product with the same name for this business. If found, links it.
   * If not, creates a new Product with stock "0" (the quantity is
   * already in-use on the order) so the client can restock later. */
  async addItem(repairAppointmentId: string, input: AddOrderItemInput, actorUsername: string): Promise<RepairOrderItem> {
    // book() numbers every new appointment, so this only ever fires for a
    // legacy row created before that -- same shared sequence either way.
    const appointment = await prisma.repairAppointment.findUnique({
      where: { id: repairAppointmentId },
      select: { businessId: true, serialNumber: true },
    });
    if (appointment && !appointment.serialNumber) {
      const serialNumber = await nextDocumentNumber(appointment.businessId);
      await prisma.repairAppointment.update({ where: { id: repairAppointmentId }, data: { serialNumber } });
    }

    // Resolve productId for manual parts: reuse existing inventory item
    // by name, or create a new one with stock "0" so the client can
    // restock later. No stock is consumed either way.
    let productId = input.productId ?? null;
    if (input.kind === "part" && !productId && appointment) {
      const existing = await prisma.product.findFirst({
        where: { businessId: appointment.businessId, name: input.name },
      });
      if (existing) {
        productId = existing.id;
      } else {
        const product = await prisma.product.create({
          data: {
            businessId: appointment.businessId,
            name: input.name,
            costPrice: input.costPrice != null ? String(input.costPrice) : null,
            price: String(input.defaultPrice),
            stock: "0",
          },
        });
        productId = product.id;
      }
    }

    // An Inventory part draws from its stock lots oldest-first; the line
    // keeps the weighted unit cost of exactly those lots (and which lots),
    // so a later restock at a new cost never changes what this sale cost.
    const usedStock = input.kind === "part" && input.productId ? await consumeStock(input.productId, input.quantity) : null;

    const row = await prisma.repairOrderItem.create({
      data: {
        repairAppointmentId,
        productId,
        kind: input.kind,
        name: input.name,
        quantity: input.quantity,
        defaultPrice: input.defaultPrice,
        costPrice: input.productId ? (usedStock?.unitCost ?? null) : (input.costPrice ?? null),
        lotAllocations: usedStock && usedStock.allocations.length > 0 ? (usedStock.allocations as unknown as object) : undefined,
      },
    });

    if (appointment) {
      await logAudit({ businessId: appointment.businessId, entityType: "order-item", entityId: row.id, action: "item_added", detail: input.name, actorUsername });
    }

    return toItem(row);
  }

  async updateItemPrice(itemId: string, overridePrice: number | null, actorUsername: string): Promise<RepairOrderItem> {
    const row = await prisma.repairOrderItem.update({ where: { id: itemId }, data: { overridePrice }, include: { repairAppointment: { select: { businessId: true } } } });
    await logAudit({ businessId: row.repairAppointment.businessId, entityType: "order-item", entityId: itemId, action: "price_overridden", detail: overridePrice != null ? String(overridePrice) : "cleared", actorUsername });
    return toItem(row);
  }

  async removeItem(itemId: string, actorUsername: string): Promise<void> {
    const item = await prisma.repairOrderItem.findUnique({ where: { id: itemId }, include: { repairAppointment: { select: { businessId: true, trackingToken: true, customerName: true } } } });
    if (!item) return;

    await archiveDeleted({
      businessId: item.repairAppointment.businessId,
      entityType: "order-item",
      entityId: itemId,
      label: item.name,
      data: { ...item, repairAppointmentId: undefined },
      deletedBy: actorUsername,
    });

    if (item.kind === "part" && item.productId) {
      await restoreStock(item.productId, item.lotAllocations as LotAllocation[] | null, item.quantity);
    }

    await prisma.repairOrderItem.delete({ where: { id: itemId } });
    await logAudit({ businessId: item.repairAppointment.businessId, entityType: "order-item", entityId: itemId, action: "item_removed", detail: item.name, actorUsername });
  }

  totalForAppointment(appointment: RepairAppointment): number {
    return appointment.items.reduce((sum, item) => sum + item.finalPrice, 0);
  }
}
