import { prisma } from "@ai-chat-platform/database";

export interface OrderInput {
  businessId: string;
  conversationId: string;
  customerName: string;
  phone: string;
  deliveryAddress: string;
  products: string;
  paymentMethod: string;
}

export interface Order extends OrderInput {
  id: string;
  email: string | null;
  courier: string | null;
  trackingId: string | null;
  deliveryStatus: string;
  createdAt: string;
}

export const DELIVERY_STATUSES = ["pending", "picked_up", "in_transit", "delivered", "returned"] as const;

export interface UpdateDeliveryInput {
  email?: string | null;
  courier?: string | null;
  trackingId?: string | null;
  deliveryStatus?: string;
}

function toOrder(row: {
  id: string;
  businessId: string;
  conversationId: string;
  customerName: string;
  phone: string;
  email: string | null;
  deliveryAddress: string;
  products: string;
  paymentMethod: string;
  courier: string | null;
  trackingId: string | null;
  deliveryStatus: string;
  createdAt: Date;
}): Order {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** Orders the AI takes directly inside a chat conversation — see Order's
 * own schema comment for the [[ORDER_TAKEN:{...}]] marker mechanism that
 * creates these. */
export class OrderService {
  async create(input: OrderInput): Promise<Order> {
    const row = await prisma.order.create({ data: input });

    // Track usage for billing (fire and forget)
    prisma.businessUsage.upsert({
      where: { businessId: input.businessId },
      update: { orderCount: { increment: 1 } },
      create: { businessId: input.businessId, orderCount: 1 },
    }).catch((err) => console.error("[Usage] Failed to track order:", err));

    return toOrder(row);
  }

  async listForBusiness(businessId: string, limit = 200): Promise<Order[]> {
    const rows = await prisma.order.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(toOrder);
  }

  /** Manual delivery tracking — courier/trackingId are free text a
   * staff member fills in by hand; there is no real courier API call
   * here (no merchant credentials for Pathao/Steadfast/etc. exist in
   * this deployment). A real adapter would plug in right here: call
   * the provider's "create shipment" endpoint on first save, then a
   * webhook or polling job would keep deliveryStatus in sync instead
   * of a human updating it — same seam RepairAppointment.status left
   * for a future automated status source. */
  async updateDelivery(id: string, input: UpdateDeliveryInput): Promise<Order> {
    const row = await prisma.order.update({ where: { id }, data: input });
    return toOrder(row);
  }
}
