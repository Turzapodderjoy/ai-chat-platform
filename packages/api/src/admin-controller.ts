import { AIManager } from "@ai-chat-platform/ai-manager";
import { VectorStoreManager } from "@ai-chat-platform/vector-store";
import { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import { ChatUsageLog, ResponseCache } from "@ai-chat-platform/chat-service";
import { PROVIDER_CATALOG, PLANNED_PROVIDERS } from "@ai-chat-platform/provider-catalog";
import { TenantService } from "@ai-chat-platform/tenant";
import { ConversationService } from "@ai-chat-platform/conversation";
import { CrawlerService } from "@ai-chat-platform/web-crawler";
import { ProviderKeyStore, ProviderStateStore } from "@ai-chat-platform/provider-keys";
import { CustomOpenAICompatibleProvider } from "@ai-chat-platform/provider-catalog";
import { prisma } from "@ai-chat-platform/database";

export interface KnowledgeDocumentSummary {
  documentId: string;
  filename: string;
  chunks: number;
  /** Only meaningful for crawler-sourced pages; uploaded files show "uploaded". */
  status: string;
  lastCrawledAt: string | null;
  /** When this document was last (re)indexed — covers both uploads and
   * crawls. Null only for chunks indexed before this field existed. */
  lastUpdated: string | null;
}

export class AdminController {
  constructor(
    private readonly ai: AIManager,
    private readonly vectorStore: VectorStoreManager,
    private readonly embeddings: EmbeddingManager,
    private readonly chatUsageLog: ChatUsageLog,
    private readonly responseCache: ResponseCache,
    private readonly tenants: TenantService,
    private readonly conversations: ConversationService,
    private readonly crawler: CrawlerService,
    private readonly providerKeys: ProviderKeyStore,
    private readonly providerState: ProviderStateStore
  ) {}

  providers() {
    return {
      active: this.ai.getProviders().map((p) => p.name),
      status: this.ai.getProviderStatus(),
    };
  }

  /** Every provider the dashboard can offer to activate, coded or not. */
  catalog() {
    return {
      available: PROVIDER_CATALOG.map((entry) => ({
        id: entry.id,
        label: entry.label,
      })),
      planned: PLANNED_PROVIDERS,
    };
  }

  /** Registers (or re-keys) a provider at runtime — no restart needed —
   * AND persists the key to Postgres so it survives one. Without the
   * persistence half, "activate" was only ever a live patch to the
   * in-memory AIManager that silently reverted to whatever .env said
   * the next time the process restarted, which isn't actually
   * plug-and-play no matter what the dashboard copy claims. */
  async activateProvider(id: string, apiKey: string): Promise<{ activated: string }> {
    const entry = PROVIDER_CATALOG.find((e) => e.id === id);

    if (!entry) {
      throw new Error(
        `No adapter implemented for "${id}" yet — add it to packages/provider-catalog first.`
      );
    }

    if (!apiKey.trim()) {
      throw new Error("API key is required.");
    }

    if (this.ai.hasProvider(id)) {
      this.ai.setProviderKey(id, apiKey);
    } else {
      this.ai.registerProvider(entry.create(), [
        { id: `${id}-ui`, value: apiKey },
      ]);
    }

    await this.providerKeys.set("ai", id, apiKey);

    return { activated: id };
  }

  /** Forces a provider on/off for experimentation — independent of its
   * actual health/key state. Disabling every provider but one forces
   * that one to handle every request; disabling one forces the rest to
   * pick up its traffic. Takes effect on the very next chat, no restart —
   * and persists, so it stays off after a restart/redeploy/cold start
   * too (previously reverted to enabled every time). */
  async setProviderEnabled(id: string, enabled: boolean): Promise<{ id: string; enabled: boolean }> {
    this.ai.setProviderEnabled(id, enabled);
    await this.providerState.setEnabled("ai", id, enabled);
    return { id, enabled };
  }

  /** Adds a user-defined provider speaking the standard OpenAI-compatible
   * /chat/completions shape — for a newly-released vendor not in the
   * hardcoded catalog, without writing a new adapter package. */
  async addCustomProvider(
    label: string,
    baseUrl: string,
    model: string,
    apiKey: string
  ): Promise<{ id: string }> {
    if (!label.trim() || !baseUrl.trim() || !model.trim() || !apiKey.trim()) {
      throw new Error("Label, base URL, model, and API key are all required.");
    }

    const row = await prisma.customProvider.create({
      data: { label, baseUrl, model, apiKey },
    });

    this.ai.registerProvider(
      new CustomOpenAICompatibleProvider(row.id, baseUrl, model),
      [{ id: `${row.id}-ui`, value: apiKey }]
    );

    return { id: row.id };
  }

  customProviders() {
    return prisma.customProvider.findMany({
      select: { id: true, label: true, baseUrl: true, model: true, createdAt: true },
    });
  }

  /** Clears a provider's key both live (so it stops being usable
   * immediately, not just after a restart) and in Postgres. For a
   * catalog provider this leaves it registered-but-keyless — activating
   * it again just supplies a new key. For a custom provider, also
   * deletes its CustomProvider row so it doesn't reappear on restart. */
  async removeProviderKey(id: string): Promise<{ id: string }> {
    if (this.ai.hasProvider(id)) {
      this.ai.clearProviderKeys(id);
    }

    await this.providerKeys.remove("ai", id);
    await prisma.customProvider.deleteMany({ where: { id } });

    return { id };
  }

  usage() {
    return {
      ai: this.ai.getUsage(),
      embeddings: this.embeddings.getUsage(),
      cache: this.responseCache.stats(),
    };
  }

  chatUsage() {
    return this.chatUsageLog.recent();
  }

  async knowledge(businessId?: string): Promise<KnowledgeDocumentSummary[]> {
    const records = await this.vectorStore.listAll();

    const byDocument = new Map<string, KnowledgeDocumentSummary>();

    for (const record of records) {
      if (businessId && record.metadata?.businessId !== businessId) {
        continue;
      }

      const lastCrawledAt = (record.metadata?.lastCrawledAt as string | undefined) ?? null;
      // indexedAt is the more universal field (uploads never had a
      // timestamp before it existed) — falls back to lastCrawledAt for
      // chunks indexed before indexedAt was introduced.
      const indexedAt = (record.metadata?.indexedAt as string | undefined) ?? lastCrawledAt;

      const existing = byDocument.get(record.documentId);

      if (existing) {
        existing.chunks += 1;
        // Chunks of the same document can carry slightly different
        // timestamps (batched, but not guaranteed identical) — the
        // document's "last updated" is whichever chunk is newest.
        if (indexedAt && (!existing.lastUpdated || indexedAt > existing.lastUpdated)) {
          existing.lastUpdated = indexedAt;
        }
        continue;
      }

      byDocument.set(record.documentId, {
        documentId: record.documentId,
        filename:
          (record.metadata?.filename as string | undefined) ?? "unknown",
        chunks: 1,
        status:
          (record.metadata?.pageStatus as string | undefined) ??
          (record.metadata?.source === "crawler" ? "new" : "uploaded"),
        lastCrawledAt,
        lastUpdated: indexedAt,
      });
    }

    return [...byDocument.values()];
  }

  /** Removes one indexed document (all its chunks) — does not touch the
   * crawl target that produced it, if any; that keeps re-crawling. When
   * called with a businessId (every real caller — the per-client and
   * mother dashboards both know which business they're scoped to), this
   * verifies the document actually belongs to that business first, so a
   * guessed/leaked documentId from another client can't be used to
   * delete their content. */
  async deleteDocument(documentId: string, businessId?: string): Promise<{ deleted: string }> {
    if (businessId) {
      const records = await this.vectorStore.listAll();
      const owned = records.some(
        (r) => r.documentId === documentId && r.metadata?.businessId === businessId
      );

      if (!owned) {
        throw new Error("Document not found for this business.");
      }
    }

    await this.vectorStore.deleteByDocumentId(documentId);
    return { deleted: documentId };
  }

  /** Every client, for the mother dashboard's client list. */
  listBusinesses() {
    return this.tenants.listAll();
  }

  /** Its dashboard exists immediately at /dashboard/{id} — one dynamic
   * route serves every client, so nothing needs deploying per company. */
  createClient(name: string) {
    if (!name.trim()) {
      throw new Error("Company name is required.");
    }

    return this.tenants.createBusiness(name);
  }

  /** Removes a client and everything scoped to it: conversations (and
   * their messages, via cascade), crawl targets, and indexed knowledge —
   * not just the Business row, so nothing is left orphaned. */
  async deleteClient(businessId: string): Promise<{ deleted: string }> {
    const records = await this.vectorStore.listAll();
    const documentIds = new Set(
      records
        .filter((r) => r.metadata?.businessId === businessId)
        .map((r) => r.documentId)
    );

    for (const documentId of documentIds) {
      await this.vectorStore.deleteByDocumentId(documentId);
    }

    await this.crawler.deleteTargetsForBusiness(businessId);
    await this.conversations.deleteByBusinessId(businessId);
    await this.tenants.deleteBusiness(businessId);

    return { deleted: businessId };
  }

  /** Where a client's data actually lives and roughly how much of it
   * there is — deliberately honest that this is a local JSON file today,
   * not a real cloud object store or vector DB yet. */
  async storageInfo(businessId: string): Promise<{
    knowledgeChunks: number;
    knowledgeDocuments: number;
    knowledgeBytesEstimate: number;
    conversations: number;
    messages: number;
    crawlTargets: number;
    vectorStoreLocation: string;
    databaseLocation: string | null;
  }> {
    const records = await this.vectorStore.listAll();
    const forBusiness = records.filter((r) => r.metadata?.businessId === businessId);

    const knowledgeBytesEstimate = forBusiness.reduce(
      (sum, r) => sum + JSON.stringify(r).length,
      0
    );

    const [conversations, messages, crawlTargets] = await Promise.all([
      prisma.conversation.count({ where: { businessId } }),
      prisma.message.count({ where: { conversation: { businessId } } }),
      prisma.crawlTarget.count({ where: { businessId } }),
    ]);

    const url = process.env.DATABASE_URL;

    return {
      knowledgeChunks: forBusiness.length,
      knowledgeDocuments: new Set(forBusiness.map((r) => r.documentId)).size,
      knowledgeBytesEstimate,
      conversations,
      messages,
      crawlTargets,
      vectorStoreLocation: "Postgres (packages/database) — shared across clients by businessId tag, brute-force cosine similarity in JS, not pgvector",
      databaseLocation: url ? `PostgreSQL — ${maskConnectionString(url)}` : null,
    };
  }

  async database(): Promise<{ connected: boolean; host: string | null; error?: string }> {
    const url = process.env.DATABASE_URL;
    const host = url ? maskConnectionString(url) : null;

    if (!url) {
      return { connected: false, host: null, error: "DATABASE_URL is not set" };
    }

    try {
      await prisma.$queryRaw`SELECT 1`;
      return { connected: true, host };
    } catch (error) {
      return {
        connected: false,
        host,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace("/", "")}`;
  } catch {
    return "unknown";
  }
}
