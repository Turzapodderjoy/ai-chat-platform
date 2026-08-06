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
import { UploadService } from "@ai-chat-platform/upload";
import { TenantService } from "@ai-chat-platform/tenant";
import { CrawlerService } from "@ai-chat-platform/web-crawler";
import {
  ChatAnalysisService,
  ReasoningClient,
  ChatAnalysisPipeline,
  PromptSuggestionService,
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
import { ApiRouter } from "@ai-chat-platform/api";
import { ClientAuthService } from "@ai-chat-platform/client-auth";

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
        aiConfig
      );

    const rag =
      new RagService(chat);

    // Shared by both upload and crawler — each used to build its own
    // private IndexingService (and inside that, its own unconfigured
    // EmbeddingManager), meaning uploaded/crawled documents never got
    // the dashboard-activated/rotating embedding providers everything
    // else uses. One instance now, wired to the real `embeddings`.
    const indexingService =
      new IndexingService(embeddings, vectorStore);

    const uploadService =
      new UploadService(
        new IngestionPipeline(),
        indexingService
      );

    const tenants =
      new TenantService();

    const crawlerService =
      new CrawlerService(indexingService, vectorStore);

    // Deliberately its own dedicated key (GROQ_TRAINING_API_KEY), not
    // the shared AIManager/Groq key powering live chat — training's
    // reasoning calls (Training Arena review, dumped-chat interpretation,
    // refine) must never compete with real customer traffic for Groq's
    // rate limit.
    const reasoningClient =
      new ReasoningClient(process.env.GROQ_TRAINING_API_KEY ?? "");

    const chatAnalysisService =
      new ChatAnalysisService();

    const messageFeedback =
      new MessageFeedbackService();

    const chatAnalysisPipeline =
      new ChatAnalysisPipeline(
        chatAnalysisService,
        reasoningClient,
        aiConfig,
        messageFeedback
      );

    const promptSuggestionService =
      new PromptSuggestionService(
        chatAnalysisService,
        reasoningClient,
        aiConfig
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
          chatAnalysisService,
          aiConfig,
          chatAnalysisPipeline,
          promptSuggestionService,
          tenants,
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
        new ClientAuthController(clientAuth)
      );
  }

  readonly router: ApiRouter;
}
