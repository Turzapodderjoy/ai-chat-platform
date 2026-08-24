import { ConversationService } from "@ai-chat-platform/conversation";
import { RepairAppointmentService } from "@ai-chat-platform/repairs";

export interface BookRepairInput {
  businessId: string;
  customerName: string;
  phone: string;
  deviceType: string;
  deviceModel?: string;
  issueDescription: string;
  appointmentDate: string;
}

/** Appointment booking + tracking for a client with no AI bot at all
 * (PhoneRepairZoneAZ and any future client like it) — the tracking token
 * doubles as the linked Conversation's id, so the existing generic
 * messaging pipeline (ConversationService/HandoffController) handles the
 * "contact us" thread with no new messaging code. */
export class RepairController {
  constructor(
    private readonly repairs: RepairAppointmentService,
    private readonly conversations: ConversationService
  ) {}

  async book(input: BookRepairInput): Promise<{ trackingToken: string }> {
    const trackingToken = await this.repairs.generateTrackingToken();

    await this.repairs.book({
      businessId: input.businessId,
      trackingToken,
      customerName: input.customerName,
      phone: input.phone,
      deviceType: input.deviceType,
      deviceModel: input.deviceModel,
      issueDescription: input.issueDescription,
      appointmentDate: new Date(input.appointmentDate),
    });

    // No AI here at all — straight to a human handoff so the appointment
    // shows up under "Needs Handoff" the moment it's booked, never
    // touching ChatService.
    await this.conversations.getOrCreate(trackingToken, input.businessId, "customer", false, "repair-tracking", null);
    await this.conversations.requestHandoff(trackingToken, "repair appointment", "New repair appointment booked");

    return { trackingToken };
  }

  async track(trackingToken: string) {
    const appointment = await this.repairs.findByToken(trackingToken);
    if (!appointment) {
      throw new Error("Tracking token not found");
    }
    const messages = await this.conversations.history(trackingToken, 100);
    return { appointment, messages };
  }

  async addTrackingMessage(trackingToken: string, message: string): Promise<{ ok: true }> {
    const appointment = await this.repairs.findByToken(trackingToken);
    if (!appointment) {
      throw new Error("Tracking token not found");
    }
    await this.conversations.addMessage(trackingToken, "user", message);
    return { ok: true };
  }

  listForBusiness(businessId?: string) {
    return this.repairs.listForBusiness(businessId);
  }

  updateStatus(id: string, status: string) {
    return this.repairs.updateStatus(id, status);
  }
}
