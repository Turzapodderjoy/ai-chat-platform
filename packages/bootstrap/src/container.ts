import { AIManager } from "@ai-chat-platform/ai-manager";
import { PromptEngine } from "@ai-chat-platform/prompt-engine";
import { ConversationService, MessageFeedbackService } from "@ai-chat-platform/conversation";
import type { Retriever } from "@ai-chat-platform/retriever";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";
import type { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import type { ProviderKeyStore, ProviderStateStore } from "@ai-chat-platform/provider-keys";
import { ChatService, ChatUsageLog, ResponseCache } from "@ai-chat-platform/chat-service";
import { AiConfigService } from "@ai-chat-platform/ai-config";
import { RagService } from "@ai-chat-platform/rag";
import { IngestionPipeline } from "@ai-chat-platform/ingestion";
import { IndexingService } from "@ai-chat-platform/indexing";
import { TabularExtractionClient } from "@ai-chat-platform/tabular-extraction";
import { UploadService } from "@ai-chat-platform/upload";
import { TenantService } from "@ai-chat-platform/tenant";
import { CrawlerService } from "@ai-chat-platform/web-crawler";
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
import { WidgetConfigController } from "@ai-chat-platform/api";
import { KnowledgeRefreshController } from "@ai-chat-platform/api";
import { RefreshScheduleService, MasterCsvService } from "@ai-chat-platform/knowledge-refresh";
import { ApiRouter } from "@ai-chat-platform/api";
import { ClientAuthService } from "@ai-chat-platform/client-auth";
import { WidgetConfigService } from "@ai-chat-platform/widget-config";

export class Container {

  constructor(
    retriever: Retriever,
    vectorStore: VectorStoreManager,
    embeddings: EmbeddingManager,
    ai: AIManager,
    providerKeys: ProviderKeyStore,
    providerState: ProviderStateStore
  ) {

    const conversations =
      new ConversationService();

    const prompts =
      new PromptEngine();

    const chatUsageLog =
      new ChatUsageLog();

    const responseCache =
      new ResponseCache();

    const aiConfig =
      new AiConfigService();

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
        vectorStore
      );

    const rag =
      new RagService(chat);

    // Own dedicated key (GROQ_EXTRACTION_API_KEY), not the shared
    // AIManager/Groq key powering live chat — this runs on every crawl
    // and every document upload, for every business, so it needs its
    // own quota lane entirely. See TabularExtractionClient's own comment
    // for what it does and why it can never break an upload/crawl on
    // failure (a real Gemini key was tried first and hit its free
    // tier's 20-requests/day cap on the very first live test).
    const tabularExtraction =
      new TabularExtractionClient(process.env.GROQ_EXTRACTION_API_KEY ?? "");

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

    const crawlerService =
      new CrawlerService(indexingService, vectorStore);

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
      new AutoHealService(crawlerService, indexingService, embeddings, tenants);

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
        new HandoffController(conversations, channelConnections),
        new CrawlerController(crawlerService),
        new AiConfigController(aiConfig, tenants),
        new EmbeddingController(embeddings, providerKeys, indexingService, providerState),
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
        new KnowledgeRefreshController(refreshSchedule, masterCsv)
      );
  }

  readonly router: ApiRouter;
}
