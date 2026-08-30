import { ConversationService } from "@ai-chat-platform/conversation";
import { RepairAppointmentService, StaffService } from "@ai-chat-platform/repairs";
import { EmailSenderConfigService, ResendEmailClient, StatusEmailService } from "@ai-chat-platform/email";
import { TenantService } from "@ai-chat-platform/tenant";
import { ContactService, DealService } from "@ai-chat-platform/crm";

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
    private readonly staff: StaffService,
    private readonly conversations: ConversationService,
    private readonly emailSenderConfig: EmailSenderConfigService,
    private readonly emailClient: ResendEmailClient,
    private readonly tenants: TenantService,
    private readonly contacts: ContactService,
    private readonly deals: DealService,
    private readonly statusEmails: StatusEmailService
  ) {}

  async book(input: BookRepairInput): Promise<{ trackingToken: string }> {
    // Confirmed live: a client site sent its own slug ("phonerepairzoneaz")
    // instead of the real businessId cuid, and this silently created
    // appointments under a businessId that matched nothing — invisible in
    // every dashboard, no error anywhere. Reject unknown businessId
    // outright instead of creating an orphan.
    const business = await this.tenants.getBusiness(input.businessId);
    if (!business) {
      throw new Error(`Unknown businessId: "${input.businessId}"`);
    }

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

    // Non-blocking — a booking every appointment naturally becomes an
    // open sales opportunity, so this is auto-created here rather than
    // left for staff to type in by hand.
    this.contacts
      .upsert({ businessId: input.businessId, name: input.customerName, phone: input.phone, email: input.email })
      .then((contact) =>
        this.deals.create({
          businessId: input.businessId,
          contactId: contact.id,
          title: `${input.deviceType}${input.deviceModel ? ` (${input.deviceModel})` : ""} repair — ${trackingToken}`,
        })
      )
      .catch(() => {});

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

  async updateStatus(id: string, status: string) {
    const appointment = await this.repairs.updateStatus(id, status);
    // Logged as a plain system message in the SAME conversation the
    // customer's own messages live in — shows up right in the thread
    // with a real timestamp, no separate history table needed.
    await this.conversations.addMessage(appointment.trackingToken, "system", `Status updated to ${REPAIR_STATUS_LABEL[status] ?? status}`);

    // Best-effort, same pattern as sendBookingEmail above — no-ops
    // silently if there's no template for this status, no customer
    // email, or no connected Gmail account.
    this.statusEmails.sendForRepairStatusChange(appointment).catch((err) =>
      console.error("[RepairController] status email failed:", err)
    );

    return appointment;
  }

  async updatePriority(id: string, priority: string) {
    return this.repairs.updatePriority(id, priority);
  }

  async updateDate(id: string, date: string) {
    return this.repairs.updateDate(id, date);
  }

  async updatePhotos(id: string, images: string[]) {
    return this.repairs.updatePhotos(id, images);
  }

  async approveReschedule(id: string) {
    const appointment = await this.repairs.approveReschedule(id);
    await this.conversations.addMessage(appointment.trackingToken, "system", `Appointment rescheduled to ${new Date(appointment.appointmentDate).toLocaleString()}`);
    this.statusEmails.sendForRepairStatusChange(appointment).catch(() => {});
    return appointment;
  }

  async rejectReschedule(id: string) {
    return this.repairs.rejectReschedule(id);
  }

  async approveCancel(id: string) {
    const appointment = await this.repairs.approveCancel(id);
    await this.conversations.addMessage(appointment.trackingToken, "system", "Appointment cancelled");
    this.statusEmails.sendForRepairStatusChange(appointment).catch(() => {});
    return appointment;
  }

  async rejectCancel(id: string) {
    return this.repairs.rejectCancel(id);
  }

  // Staff management
  listStaff(businessId: string) {
    return this.staff.listForBusiness(businessId);
  }

  createStaff(input: { businessId: string; name: string; email?: string; phone?: string; role?: string }) {
    return this.staff.create(input);
  }

  updateStaff(id: string, data: { name?: string; email?: string; phone?: string; role?: string; active?: boolean }) {
    return this.staff.update(id, data);
  }

  deleteStaff(id: string) {
    return this.staff.delete(id);
  }
}

  async deleteAppointment(id: string): Promise<{ ok: true }> {
    const appointment = await this.repairs.findById(id);
    if (appointment) {
      // trackingToken doubles as the linked Conversation's id — remove
      // that too (messages cascade), not just the appointment row,
      // otherwise the tracking page's message thread outlives the
      // appointment it was ever about.
      await this.conversations.deleteConversation(appointment.trackingToken);
    }
    await this.repairs.delete(id);
    return { ok: true };
  }
}

const REPAIR_STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  received: "Received",
  in_repair: "In Repair",
  ready: "Ready for Pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};
