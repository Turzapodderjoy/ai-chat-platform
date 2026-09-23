import { ChatController } from "./chat-controller";
import { HealthController } from "./health-controller";
import { AdminController } from "./admin-controller";
import { HandoffController } from "./handoff-controller";
import { ChannelController } from "./channel-controller";
import { TagController } from "./tag-controller";
import { ClientAuthController } from "./client-auth-controller";
import { WidgetConfigController } from "./widget-config-controller";
import { ProductController } from "./product-controller";
import { OrderController } from "./order-controller";
import { RepairController } from "./repair-controller";
import { EmailController } from "./email-controller";
import { CrmController } from "./crm-controller";
import { RevenueController } from "./revenue-controller";
import { ReportingController } from "./reporting-controller";
import { WidgetVisibilityController } from "./widget-visibility-controller";
import { AdminNotificationController } from "./admin-notification-controller";
import { DashboardThemeController } from "./dashboard-theme-controller";
import { ApprovalController } from "./approval-controller";
import { StatusEmailTemplateController } from "./status-email-template-controller";
import { GmailSenderConfigController } from "./gmail-sender-config-controller";
import { OfferController } from "./offer-controller";
import { GoogleSignInController } from "./google-sign-in-controller";
import { HermesAdminController } from "./hermes-admin-controller";

export class ApiRouter {
  constructor(
    readonly chat: ChatController,
    readonly health: HealthController,
    readonly admin: AdminController,
    readonly handoff: HandoffController,
    readonly channels: ChannelController,
    readonly tags: TagController,
    readonly clientAuth: ClientAuthController,
    readonly widgetConfig: WidgetConfigController,
    readonly products: ProductController,
    readonly orders: OrderController,
    readonly repairs: RepairController,
    readonly email: EmailController,
    readonly crm: CrmController,
    readonly revenue: RevenueController,
    readonly reporting: ReportingController,
    readonly widgetVisibility: WidgetVisibilityController,
    readonly adminNotifications: AdminNotificationController,
    readonly dashboardTheme: DashboardThemeController,
    readonly approvals: ApprovalController,
    readonly statusEmailTemplates: StatusEmailTemplateController,
    readonly gmailSenderConfig: GmailSenderConfigController,
    readonly offers: OfferController,
    readonly googleSignIn: GoogleSignInController,
    readonly hermes: HermesAdminController
  ) {}
}