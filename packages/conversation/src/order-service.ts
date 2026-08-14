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
  createdAt: string;
}

function toOrder(row: {
  id: string;
  businessId: string;
  conversationId: string;
  customerName: string;
  phone: string;
  deliveryAddress: string;
  products: string;
  paymentMethod: string;
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
}
