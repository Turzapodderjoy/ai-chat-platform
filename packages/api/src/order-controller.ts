import { OrderService, type UpdateDeliveryInput } from "@ai-chat-platform/conversation";
import { StatusEmailService } from "@ai-chat-platform/email";

/** The Orders panel's data source — orders the AI takes directly inside a
 * chat conversation (see ChatService's ORDER_TAKEN marker handling). */
export class OrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly statusEmails: StatusEmailService
  ) {}

  list(businessId: string) {
    return this.orders.listForBusiness(businessId);
  }

  async updateDelivery(id: string, input: UpdateDeliveryInput) {
    const order = await this.orders.updateDelivery(id, input);

    // Best-effort — never blocks the status-update response. No-ops
    // silently if there's no template for this status, no customer
    // email, or no connected Gmail account (see StatusEmailService).
    if (input.deliveryStatus) {
      this.statusEmails.sendForOrderStatusChange(order).catch((err) =>
        console.error("[OrderController] status email failed:", err)
      );
    }

    return order;
  }
}
