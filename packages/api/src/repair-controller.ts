import { ConversationService } from "@ai-chat-platform/conversation";
import { RepairAppointmentService } from "@ai-chat-platform/repairs";
import { EmailSenderConfigService, ResendEmailClient } from "@ai-chat-platform/email";

export interface BookRepairInput {
  businessId: string;
  customerName: string;
  phone: string;
  email?: string;
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
    private readonly conversations: ConversationService,
    private readonly emailSenderConfig: EmailSenderConfigService,
    private readonly emailClient: ResendEmailClient
  ) {}

  async book(input: BookRepairInput): Promise<{ trackingToken: string }> {
    const trackingToken = await this.repairs.generateTrackingToken();

    await this.repairs.book({
      businessId: input.businessId,
      trackingToken,
      customerName: input.customerName,
      phone: input.phone,
      email: input.email,
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

    // Best-effort — never blocks the booking response. Silently skipped
    // when the customer gave no email, or the business hasn't set up its
    // sender identity yet (see EmailSenderConfigService).
    this.sendBookingEmail(input, trackingToken).catch((err) =>
      console.error("[RepairController] booking email failed:", err)
    );

    return { trackingToken };
  }

  private async sendBookingEmail(input: BookRepairInput, trackingToken: string): Promise<void> {
    if (!input.email) return;

    const sender = await this.emailSenderConfig.get(input.businessId);
    if (!sender.fromEmail) return;

    const trackingLine = sender.trackingPageUrl
      ? `<p>Track your repair anytime at <a href="${sender.trackingPageUrl}">${sender.trackingPageUrl}</a> using the code below.</p>`
      : `<p>Use the code below to track your repair.</p>`;

    await this.emailClient.send({
      to: input.email,
      from: sender.fromName ? `${sender.fromName} <${sender.fromEmail}>` : sender.fromEmail,
      subject: "Your repair appointment is booked",
      html: `
        <p>Hi ${input.customerName},</p>
        <p>Your repair appointment for <strong>${input.deviceType}${input.deviceModel ? ` (${input.deviceModel})` : ""}</strong> is booked for ${new Date(input.appointmentDate).toLocaleString()}.</p>
        ${trackingLine}
        <p style="font-size: 20px; font-weight: 700; letter-spacing: 2px;">${trackingToken}</p>
      `,
    });
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
