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
import { WidgetConfigController, DashboardThemeController } from "@ai-chat-platform/api";
import { KnowledgeRefreshController } from "@ai-chat-platform/api";
import { ClientHealthController, ProductController, OrderController, RepairController, EmailController, CrmController, RevenueController, ReportingController, WidgetVisibilityController } from "@ai-chat-platform/api";
import { RepairAppointmentService } from "@ai-chat-platform/repairs";
import { EmailSenderConfigService, ResendEmailClient } from "@ai-chat-platform/email";
import { ContactService, CompanyService, DealService } from "@ai-chat-platform/crm";
import { QuoteService, InvoiceService, PaymentService } from "@ai-chat-platform/revenue";
import { ReportingService } from "@ai-chat-platform/reporting";
import { WidgetVisibilityService } from "@ai-chat-platform/widget-visibility";
import { RefreshScheduleService, MasterCsvService } from "@ai-chat-platform/knowledge-refresh";
import { ApiRouter } from "@ai-chat-platform/api";
import { ClientAuthService } from "@ai-chat-platform/client-auth";
import { WidgetConfigService } from "@ai-chat-platform/widget-config";
import { DashboardThemeService } from "@ai-chat-platform/dashboard-theme";

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

    const productSync =
      new ProductSyncService(vectorStore);

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

    const emailSenderConfig =
      new EmailSenderConfigService();

    const emailClient =
      new ResendEmailClient();

    const contacts =
      new ContactService();

    const companies =
      new CompanyService();

    const deals =
      new DealService();

    const quotes =
      new QuoteService();

    const invoices =
      new InvoiceService();

    const payments =
      new PaymentService();

    const reporting =
      new ReportingService();

    const widgetVisibility =
      new WidgetVisibilityService();

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
        deals
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
        new ProductController(productService),
        new OrderController(orders),
        new RepairController(repairs, conversations, emailSenderConfig, emailClient, tenants, contacts, deals),
        new EmailController(emailSenderConfig),
        new CrmController(contacts, companies, deals),
        new RevenueController(quotes, invoices, payments),
        new ReportingController(reporting),
        new WidgetVisibilityController(widgetVisibility),
        new DashboardThemeController(dashboardTheme)
      );
  }

  readonly router: ApiRouter;
}
