import { ConversationService, OrderService, ConversationNoteService } from "@ai-chat-platform/conversation";
import { ChatService, ChatUsageLog } from "@ai-chat-platform/chat-service";
import { TenantService } from "@ai-chat-platform/tenant";
import { ProductSyncService, ProductService } from "@ai-chat-platform/product-catalog";
import { ChannelConnectionService, ChannelAppCredentialService } from "@ai-chat-platform/channel-connections";
import { TagService, TagAssignmentService, AnalyticsService } from "@ai-chat-platform/tagging-pipeline";
import { RepairAppointmentService, StaffService } from "@ai-chat-platform/repairs";
import { EmailSenderConfigService, GmailSenderConfigService, GmailEmailClient, StatusEmailTemplateService, StatusEmailService } from "@ai-chat-platform/email";
import { ContactService } from "@ai-chat-platform/crm";
import { InvoiceService, PaymentService } from "@ai-chat-platform/revenue";
import { ReportingService } from "@ai-chat-platform/reporting";
import { WidgetVisibilityService } from "@ai-chat-platform/widget-visibility";
import { OfferService } from "@ai-chat-platform/offers";
import { AdminNotificationService } from "@ai-chat-platform/notifications";
import { ClientAuthService, GoogleSignInService } from "@ai-chat-platform/client-auth";
import { WidgetConfigService } from "@ai-chat-platform/widget-config";
import { DashboardThemeService } from "@ai-chat-platform/dashboard-theme";
import { ApprovalService } from "@ai-chat-platform/approvals";
import {
  ApiRouter,
  ChatController,
  HealthController,
  AdminController,
  HandoffController,
  ChannelController,
  TagController,
  ClientAuthController,
  WidgetConfigController,
  ProductController,
  OrderController,
  RepairController,
  EmailController,
  CrmController,
  RevenueController,
  ReportingController,
  WidgetVisibilityController,
  AdminNotificationController,
  DashboardThemeController,
  ApprovalController,
  StatusEmailTemplateController,
  GmailSenderConfigController,
  OfferController,
  GoogleSignInController,
  HermesAdminController,
} from "@ai-chat-platform/api";

// The one true composition root. Every service here is stateless —
// there is no async setup left (the legacy retriever/embedding/provider
// stack that needed it was deleted), so the graph is purely
// dependency-injection-by-hand. Hermes replaces the AI stack entirely.
export class Container {
  constructor() {
    const conversations = new ConversationService();
    const conversationNotes = new ConversationNoteService();
    const chatUsageLog = new ChatUsageLog();

    const tenants = new TenantService();
    const productSync = new ProductSyncService();
    const productService = new ProductService();

    const orders = new OrderService();
    const repairs = new RepairAppointmentService();
    const staff = new StaffService();
    const contacts = new ContactService();

    const emailSenderConfig = new EmailSenderConfigService();
    const gmailSenderConfig = new GmailSenderConfigService();
    const gmailEmailClient = new GmailEmailClient(gmailSenderConfig);
    const statusEmailTemplates = new StatusEmailTemplateService();
    const statusEmails = new StatusEmailService(statusEmailTemplates, gmailEmailClient, tenants);

    const invoices = new InvoiceService();
    const payments = new PaymentService();
    const reporting = new ReportingService();
    const widgetVisibility = new WidgetVisibilityService();
    const adminNotifications = new AdminNotificationService();

    const channelConnections = new ChannelConnectionService();
    const channelAppCredentials = new ChannelAppCredentialService();

    const tagService = new TagService();
    const tagAssignments = new TagAssignmentService();
    const tagAnalytics = new AnalyticsService(tagService);

    const clientAuth = new ClientAuthService();
    const widgetConfig = new WidgetConfigService();
    const dashboardTheme = new DashboardThemeService();
    const approvals = new ApprovalService();
    const offers = new OfferService();
    const googleSignIn = new GoogleSignInService();

    const chat = new ChatService(conversations, chatUsageLog, orders, contacts, repairs);

    const statusEmailTemplateController = new StatusEmailTemplateController(statusEmailTemplates);
    const gmailSenderConfigController = new GmailSenderConfigController(gmailSenderConfig, tenants);
    const offerController = new OfferController(offers);
    const googleSignInController = new GoogleSignInController(googleSignIn);

    this.router = new ApiRouter(
      new ChatController(chat),
      new HealthController(),
      new AdminController(chatUsageLog, tenants, conversations),
      new HandoffController(conversations, channelConnections, conversationNotes),
      new ChannelController(channelConnections, channelAppCredentials, chat),
      new TagController(tagService, tagAssignments, tagAnalytics),
      new ClientAuthController(clientAuth),
      new WidgetConfigController(widgetConfig),
      new ProductController(productService, productSync),
      new OrderController(orders, statusEmails),
      new RepairController(repairs, staff, conversations, gmailEmailClient, tenants, contacts, statusEmails, invoices),
      new EmailController(emailSenderConfig),
      new CrmController(contacts),
      new RevenueController(invoices, payments, contacts, repairs, tenants, gmailEmailClient),
      new ReportingController(reporting),
      new WidgetVisibilityController(widgetVisibility),
      new AdminNotificationController(adminNotifications),
      new DashboardThemeController(dashboardTheme),
      new ApprovalController(approvals),
      statusEmailTemplateController,
      gmailSenderConfigController,
      offerController,
      googleSignInController,
      new HermesAdminController()
    );  }

  readonly router: ApiRouter;
}