import { AIManager } from "@ai-chat-platform/ai-manager";
import { PromptEngine } from "@ai-chat-platform/prompt-engine";
import { ConversationService, MessageFeedbackService, OrderService, ConversationNoteService } from "@ai-chat-platform/conversation";
import type { Retriever } from "@ai-chat-platform/retriever";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";
import type { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import type { ProviderKeyStore, ProviderStateStore } from "@ai-chat-platform/provider-keys";
import { ChatService, ChatUsageLog, ResponseCache } from "@ai-chat-platform/chat-service";
import { AiConfigService } from "@ai-chat-platform/ai-config";
import { RagService } from "@ai-chat-platform/rag";
import { IngestionPipeline } from "@ai-chat-platform/ingestion";
import { IndexingService } from "@ai-chat-platform/indexing";
import { TabularExtractionClient, TemplateExtractor, ExtractionKeyService } from "@ai-chat-platform/tabular-extraction";
import { UploadService } from "@ai-chat-platform/upload";
import { TenantService } from "@ai-chat-platform/tenant";
import { CrawlerService } from "@ai-chat-platform/web-crawler";
import { ProductSyncService, ProductService } from "@ai-chat-platform/product-catalog";
import { VisionService } from "@ai-chat-platform/vision";
import {
  GeminiBatchClient,
  ConversationReviewService,
  TrainingAnalysisService,
} from "@ai-chat-platform/training-pipeline";
import { ChannelConnectionService, ChannelAppCredentialService } from "@ai-chat-platform/channel-connections";
import {
  TagService,
  TagAssignmentService,
  AnalyticsService,
} from "@ai-chat-platform/tagging-pipeline";
import { AutoHealService } from "@ai-chat-platform/auto-heal";
import { ChatController } from "@ai-chat-platform/api";
import { UploadController } from "@ai-chat-platform/api";
import { HealthController } from "@ai-chat-platform/api";
import { AdminController } from "@ai-chat-platform/api";
import { HandoffController } from "@ai-chat-platform/api";
import { CrawlerController } from "@ai-chat-platform/api";
import { AiConfigController } from "@ai-chat-platform/api";
import { EmbeddingController } from "@ai-chat-platform/api";
import { TrainingController } from "@ai-chat-platform/api";
import { ChannelController } from "@ai-chat-platform/api";
import { FeedbackController } from "@ai-chat-platform/api";
import { AutoHealController } from "@ai-chat-platform/api";
import { TagController } from "@ai-chat-platform/api";
import { ClientAuthController } from "@ai-chat-platform/api";
import { WidgetConfigController, DashboardThemeController, ApprovalController, StatusEmailTemplateController, GmailSenderConfigController } from "@ai-chat-platform/api";
import { ApprovalService } from "@ai-chat-platform/approvals";
import { KnowledgeRefreshController } from "@ai-chat-platform/api";
import { ClientHealthController, ProductController, OrderController, RepairController, EmailController, CrmController, RevenueController, ReportingController, WidgetVisibilityController, AdminNotificationController } from "@ai-chat-platform/api";
import { RepairAppointmentService, StaffService } from "@ai-chat-platform/repairs";
import { EmailSenderConfigService, GmailSenderConfigService, GmailEmailClient, StatusEmailTemplateService, StatusEmailService } from "@ai-chat-platform/email";
import { ContactService } from "@ai-chat-platform/crm";
import { InvoiceService, PaymentService } from "@ai-chat-platform/revenue";
import { ReportingService } from "@ai-chat-platform/reporting";
import { WidgetVisibilityService } from "@ai-chat-platform/widget-visibility";
import { OfferService } from "@ai-chat-platform/offers";
import { OfferController } from "@ai-chat-platform/api";
import { AdminNotificationService } from "@ai-chat-platform/notifications";
import { RefreshScheduleService, MasterCsvService } from "@ai-chat-platform/knowledge-refresh";
import { ApiRouter } from "@ai-chat-platform/api";
import { ClientAuthService } from "@ai-chat-platform/client-auth";
import { WidgetConfigService } from "@ai-chat-platform/widget-config";
import { DashboardThemeService } from "@ai-chat-platform/dashboard-theme";
import { GoogleSignInController } from "@ai-chat-platform/api";

// GoogleSignInService lives in client-auth package
import { GoogleSignInService } from "@ai-chat-platform/client-auth";

export class Container {

  constructor(
    retriever: Retriever,
    vectorStore: VectorStoreManager,
    embeddings: EmbeddingManager,
    ai: AIManager,
    providerKeys: ProviderKeyStore,
    providerState: ProviderStateStore,
    dbExtractionKeys: string[] = []
  ) {

    const conversations =
      new ConversationService();

    const conversationNotes =
      new ConversationNoteService();

    const prompts =
      new PromptEngine();

    const chatUsageLog =
      new ChatUsageLog();

    const responseCache =
      new ResponseCache();

    const aiConfig =
      new AiConfigService(responseCache);

    // Dedicated key(s) (GROQ_EXTRACTION_API_KEY[, _2, ...]), not the
    // shared AIManager/Groq key powering live chat — this runs on every
    // crawl and every document upload, for every business, so it needs
    // its own quota lane entirely. Several keys confirmed necessary live:
    // a single key's 429s turned out to be Groq's 100,000-tokens/DAY free
    // tier cap, not a per-minute spike, so KeyRotator (see
    // TabularExtractionClient/TemplateExtractor's own comments) hops to
    // a fresh key the moment one's daily quota is actually exhausted.
    const extractionApiKeys = [
      process.env.GROQ_EXTRACTION_API_KEY,
      process.env.GROQ_EXTRACTION_API_KEY_2,
      process.env.GROQ_EXTRACTION_API_KEY_3,
      ...dbExtractionKeys,
    ].filter(
      (k): k is string => Boolean(k)
    );

    const extractionKeyService =
      new ExtractionKeyService();

    const tabularExtraction =
      new TabularExtractionClient(extractionApiKeys);

    // Same dedicated key pool — one-time-per-site pattern derivation
    // (see TemplateExtractor's own comment), not a per-page call.
    const templateExtractor =
      new TemplateExtractor(extractionApiKeys);

    // Shared by both upload and crawler — each used to build its own
    // private IndexingService (and inside that, its own unconfigured
    // EmbeddingManager), meaning uploaded/crawled documents never got
    // the dashboard-activated/rotating embedding providers everything
    // else uses. One instance now, wired to the real `embeddings` — also
    // the single integration point for LLM tabular extraction, so both
    // upload and crawler get it automatically from this one wiring.
    const indexingService =
      new IndexingService(embeddings, vectorStore, tabularExtraction);

    const uploadService =
      new UploadService(
        new IngestionPipeline(),
        indexingService,
        vectorStore
      );

    const tenants =
      new TenantService();

    const vision =
      new VisionService(providerKeys);

    const productSync =
      new ProductSyncService(vectorStore, vision, indexingService);

    const productService =
      new ProductService();

    const crawlerService =
      new CrawlerService(indexingService, vectorStore, productSync, templateExtractor);

    const refreshSchedule =
      new RefreshScheduleService();

    const masterCsv =
      new MasterCsvService(
        crawlerService,
        indexingService,
        vectorStore,
        tabularExtraction,
        refreshSchedule
      );

    const orders =
      new OrderService();

    const repairs =
      new RepairAppointmentService();

    const staff =
      new StaffService();

    const emailSenderConfig =
      new EmailSenderConfigService();

    const contacts =
      new ContactService();

    const invoices =
      new InvoiceService();

    const payments =
      new PaymentService();

    const reporting =
      new ReportingService();

    const widgetVisibility =
      new WidgetVisibilityService();

    const adminNotifications =
      new AdminNotificationService();

    const chat =
      new ChatService(
        conversations,
        retriever,
        prompts,
        ai,
        embeddings,
        responseCache,
        chatUsageLog,
        aiConfig,
        vectorStore,
        masterCsv,
        orders,
        contacts,
        vision,
        repairs
      );

    const rag =
      new RagService(chat);

    const messageFeedback =
      new MessageFeedbackService();

    // Deliberately its own dedicated key (GEMINI_TRAINING_API_KEY), not
    // the shared AIManager/Gemini key powering live chat — Chat
    // Learning's batch-analysis calls must never compete with real
    // customer traffic for quota.
    const geminiBatchClient =
      new GeminiBatchClient(process.env.GEMINI_TRAINING_API_KEY ?? "");

    const conversationReviews =
      new ConversationReviewService();

    const trainingAnalysis =
      new TrainingAnalysisService(
        geminiBatchClient,
        aiConfig,
        messageFeedback,
        conversationReviews
      );

    const channelConnections =
      new ChannelConnectionService();

    const channelAppCredentials =
      new ChannelAppCredentialService();

    const gmailSenderConfig =
      new GmailSenderConfigService();

    const gmailEmailClient =
      new GmailEmailClient(gmailSenderConfig);

    const statusEmailTemplates =
      new StatusEmailTemplateService();

    const statusEmails =
      new StatusEmailService(statusEmailTemplates, gmailEmailClient);

    const autoHeal =
      new AutoHealService(crawlerService, indexingService, embeddings, tenants, masterCsv, refreshSchedule);

    const tagService =
      new TagService();

    const tagAssignments =
      new TagAssignmentService();

    const tagAnalytics =
      new AnalyticsService(tagService);

    const clientAuth =
      new ClientAuthService();

    const widgetConfig =
      new WidgetConfigService();

    const dashboardTheme =
      new DashboardThemeService();

    const approvals =
      new ApprovalService();

    const statusEmailTemplateController =
      new StatusEmailTemplateController(statusEmailTemplates);

    const gmailSenderConfigController =
      new GmailSenderConfigController(gmailSenderConfig);

    const offers =
      new OfferService();

    const offerController =
      new OfferController(offers);

    const googleSignIn =
      new GoogleSignInService();

    const googleSignInController =
      new GoogleSignInController(googleSignIn);

    this.router =
      new ApiRouter(
        new ChatController(rag),
        new UploadController(uploadService),
        new HealthController(),
        new AdminController(
          ai,
          vectorStore,
          embeddings,
          chatUsageLog,
          responseCache,
          tenants,
          conversations,
          crawlerService,
          providerKeys,
          providerState
        ),
        new HandoffController(conversations, channelConnections, conversationNotes),
        new CrawlerController(crawlerService),
        new AiConfigController(aiConfig, tenants),
        new EmbeddingController(embeddings, providerKeys, indexingService, providerState, tabularExtraction, extractionKeyService),
        new TrainingController(
          conversationReviews,
          trainingAnalysis,
          conversations
        ),
        new ChannelController(
          channelConnections,
          channelAppCredentials,
          rag
        ),
        new FeedbackController(messageFeedback),
        new AutoHealController(autoHeal),
        new TagController(tagService, tagAssignments, tagAnalytics),
        new ClientAuthController(clientAuth),
        new WidgetConfigController(widgetConfig),
        new KnowledgeRefreshController(refreshSchedule, masterCsv, tenants, crawlerService, vectorStore),
        new ClientHealthController(tenants, crawlerService, masterCsv, refreshSchedule, vectorStore, embeddings, conversations),
        new ProductController(productService, productSync),
        new OrderController(orders, statusEmails),
        new RepairController(repairs, staff, conversations, gmailEmailClient, tenants, contacts, statusEmails, invoices),
        new EmailController(emailSenderConfig),
        new CrmController(contacts),
        new RevenueController(invoices, payments),
        new ReportingController(reporting),
        new WidgetVisibilityController(widgetVisibility),
        new AdminNotificationController(adminNotifications),
        new DashboardThemeController(dashboardTheme),
        new ApprovalController(approvals),
        statusEmailTemplateController,
        gmailSenderConfigController,
        offerController,
        googleSignInController
      );
  }

  readonly router: ApiRouter;
}
