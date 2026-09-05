import { ChatController } from "./chat-controller";
import { UploadController } from "./upload-controller";
import { HealthController } from "./health-controller";
import { AdminController } from "./admin-controller";
import { HandoffController } from "./handoff-controller";
import { CrawlerController } from "./crawler-controller";
import { AiConfigController } from "./ai-config-controller";
import { EmbeddingController } from "./embedding-controller";
import { TrainingController } from "./training-controller";
import { ChannelController } from "./channel-controller";
import { FeedbackController } from "./feedback-controller";
import { AutoHealController } from "./auto-heal-controller";
import { TagController } from "./tag-controller";
import { ClientAuthController } from "./client-auth-controller";
import { WidgetConfigController } from "./widget-config-controller";
import { KnowledgeRefreshController } from "./knowledge-refresh-controller";
import { ClientHealthController } from "./client-health-controller";
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

export class ApiRouter {
  constructor(
    readonly chat: ChatController,
    readonly upload: UploadController,
    readonly health: HealthController,
    readonly admin: AdminController,
    readonly handoff: HandoffController,
    readonly crawler: CrawlerController,
    readonly aiConfig: AiConfigController,
    readonly embedding: EmbeddingController,
    readonly training: TrainingController,
    readonly channels: ChannelController,
    readonly feedback: FeedbackController,
    readonly autoHeal: AutoHealController,
    readonly tags: TagController,
    readonly clientAuth: ClientAuthController,
    readonly widgetConfig: WidgetConfigController,
    readonly knowledgeRefresh: KnowledgeRefreshController,
    readonly clientHealth: ClientHealthController,
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
    readonly googleSignIn: GoogleSignInController
  ) {}
}
