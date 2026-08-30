import type { Order } from "@ai-chat-platform/conversation";
import type { RepairAppointment } from "@ai-chat-platform/repairs";
import { GmailEmailClient } from "./gmail-email-client";
import { StatusEmailTemplateService } from "./status-email-template-service";

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  delivered: "Delivered",
  returned: "Returned",
};

const REPAIR_STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  received: "Received",
  in_repair: "In Repair",
  ready: "Ready for Pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/** Orchestrates "an Order/RepairAppointment status changed" -> "look up
 * this business's template for that exact status -> render -> send via
 * their connected Gmail account". Every step no-ops silently rather than
 * throwing (no template, disabled, no recipient email, no Gmail
 * connection) -- callers (OrderController/RepairController) fire this
 * fire-and-forget after their own status-update call, same as
 * RepairController.sendBookingEmail. */
export class StatusEmailService {
  constructor(
    private readonly templates: StatusEmailTemplateService,
    private readonly gmail: GmailEmailClient
  ) {}

  async sendForOrderStatusChange(order: Order): Promise<void> {
    if (!order.email) return;

    const template = await this.templates.get(order.businessId, "order_status", order.deliveryStatus);
    if (!template || !template.enabled) return;

    const vars: Record<string, string> = {
      customerName: order.customerName,
      status: order.deliveryStatus,
      statusLabel: DELIVERY_STATUS_LABEL[order.deliveryStatus] ?? order.deliveryStatus,
      trackingId: order.trackingId ?? "",
      courier: order.courier ?? "",
      products: order.products,
    };

    await this.gmail.send(order.businessId, {
      to: order.email,
      subject: renderTemplate(template.subject, vars),
      html: renderTemplate(template.bodyHtml, vars),
    });
  }

  async sendForRepairStatusChange(appointment: RepairAppointment): Promise<void> {
    if (!appointment.email) return;

    const template = await this.templates.get(appointment.businessId, "repair_status", appointment.status);
    if (!template || !template.enabled) return;

    const vars: Record<string, string> = {
      customerName: appointment.customerName,
      status: appointment.status,
      statusLabel: REPAIR_STATUS_LABEL[appointment.status] ?? appointment.status,
      deviceType: appointment.deviceType,
      deviceModel: appointment.deviceModel ?? "",
      trackingToken: appointment.trackingToken,
    };

    await this.gmail.send(appointment.businessId, {
      to: appointment.email,
      subject: renderTemplate(template.subject, vars),
      html: renderTemplate(template.bodyHtml, vars),
    });
  }
}
