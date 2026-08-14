import { OrderService } from "@ai-chat-platform/conversation";

/** The Orders panel's data source — orders the AI takes directly inside a
 * chat conversation (see ChatService's ORDER_TAKEN marker handling). */
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  list(businessId: string) {
    return this.orders.listForBusiness(businessId);
  }
}
