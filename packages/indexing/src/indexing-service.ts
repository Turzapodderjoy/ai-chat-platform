import { Chunker } from "@ai-chat-platform/chunker";
import type { EmbeddingManager } from "@ai-chat-platform/embedding-manager";

import type { VectorStoreManager } from "@ai-chat-platform/vector-store";
import type { VectorRecord } from "@ai-chat-platform/vector-store";

import type {
  IndexRequest,
  IndexResult,
} from "./types";

export class IndexingService {
  private readonly chunker =
    new Chunker();

  // Takes the shared, already-registered EmbeddingManager and
  // VectorStoreManager (both built once in bootstrap/create-app.ts)
  // instead of constructing their own — a private `new VectorStoreManager
  // (new JsonProvider())` here used to mean this class read/wrote its own
  // separate instance of the store from every other construction site.
  constructor(
    private readonly embeddingManager: EmbeddingManager,
    private readonly vectorStore: VectorStoreManager
  ) {}

  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
  }

  async index(
    request: IndexRequest
  ): Promise<IndexResult> {

    const chunks =
      request.preChunked ?? this.chunker.chunk(request.text);

    const documentId =
      request.documentId ??
      crypto.randomUUID();

    // Embeds every chunk with EVERY registered embedding provider, not
    // just one — every client's knowledge base needs to be fully mapped
    // under every provider, so retrieval never depends on which
    // provider happened to embed the query. A provider that's down for
    // this call just gets fewer vectors this round; the daily backfill
    // cron (see EmbeddingManager.embedManyAllProviders callers) catches
    // up anything that was missed.
    const perProvider =
      chunks.length > 0
        ? await this.embeddingManager.embedManyAllProviders(
            chunks.map((chunk) => chunk.content)
          )
        : [];

    const vectors: VectorRecord[] = perProvider.flatMap(({ provider, results }) =>
      chunks.map((chunk, i) => ({
        id: crypto.randomUUID(),

        documentId,

        chunkId: chunk.id,

        text: chunk.content,

        embedding:
          results[i]!.embedding,

        metadata: {
          filename: request.filename,
          chunkIndex: chunk.index,
          startOffset:
            chunk.startOffset,
          endOffset:
            chunk.endOffset,
          tokenEstimate:
            chunk.tokenEstimate,
          // Tags which embedding provider produced this vector — required
          // so retrieval only ever compares vectors from the same space
          // (see json-provider.ts's search()). Every provider gets its
          // own vector for the same chunk now, so this is what tells
          // them apart.
          embeddingProvider:
            provider,
          // Universal "when was this chunk (re)indexed" timestamp — covers
          // both uploads (which had no timestamp at all before this) and
          // crawled pages (which already had their own lastCrawledAt, kept
          // for backward compatibility since existing rows only have that).
          indexedAt:
            new Date().toISOString(),
          ...(request.metadata ?? {})
        }
      }))
    );

    await this.vectorStore.upsert(
      vectors
    );

    return {
      documentId,
      chunks: chunks.length,
      vectors: vectors.length,
      createdAt: new Date()
    };
  }

  /** Backfills missing embedding-provider coverage for content that
   * predates a provider being added (or was indexed while that provider
   * was temporarily down) — for each distinct chunk, embeds it with
   * whichever registered providers don't already have a vector for it.
   * Run daily via cron so every client's knowledge base stays fully
   * mapped under every embedding provider even as new providers get
   * added or old ones recover from an outage. */
  async backfillAllProviders(
    businessId?: string
  ): Promise<{ chunksChecked: number; chunksBackfilled: number; vectorsAdded: number }> {
    return this.backfill(businessId, undefined);
  }

  /** Same as backfillAllProviders but scoped to ONE provider — backs the
   * Knowledge Hub coverage table's per-row "Backfill" button, for
   * fixing just the one provider that's behind instead of re-checking
   * every provider. */
  async backfillProvider(
    businessId: string,
    providerName: string
  ): Promise<{ chunksChecked: number; chunksBackfilled: number; vectorsAdded: number }> {
    return this.backfill(businessId, providerName);
  }

  private async backfill(
    businessId: string | undefined,
    onlyProvider: string | undefined
  ): Promise<{ chunksChecked: number; chunksBackfilled: number; vectorsAdded: number }> {
    const all = await this.vectorStore.listAll();
    const scoped = businessId
      ? all.filter((r) => r.metadata?.businessId === businessId)
      : all;

    const byChunk = new Map<string, VectorRecord[]>();
    for (const record of scoped) {
      const key = `${record.documentId}::${record.chunkId}`;
      const list = byChunk.get(key) ?? [];
      list.push(record);
      byChunk.set(key, list);
    }

    const providerNames = onlyProvider ? [onlyProvider] : this.embeddingManager.getProviderNames();

    // Inverted from chunk-outer/provider-inner (which used to call the
    // single-item, unpaced embedWithProvider() once per chunk × missing
    // provider — hundreds of sequential unpaced requests during a real
    // backfill, the actual cause of reported 429s) to provider-outer:
    // collect every chunk missing a given provider's coverage, then embed
    // all of them in ONE embedManyWithProvider call per provider — the
    // already paced/batched path (see PROVIDER_BATCH_CONFIG in
    // embedding-manager.ts). Also means one vectorStore.upsert() call for
    // the whole run instead of N×M individual writes.
    const missingByProvider = new Map<string, VectorRecord[]>();

    for (const records of byChunk.values()) {
      // Records without a tag at all predate this feature entirely and
      // were all embedded by Jina — see postgres-provider.ts's search().
      const covered = new Set(
        records.map((r) => (r.metadata?.embeddingProvider as string | undefined) ?? "jina")
      );
      const missing = providerNames.filter((name) => !covered.has(name));

      if (missing.length === 0) {
        continue;
      }

      const sample = records[0]!;
      for (const providerName of missing) {
        const list = missingByProvider.get(providerName) ?? [];
        list.push(sample);
        missingByProvider.set(providerName, list);
      }
    }

    const newRecords: VectorRecord[] = [];
    const backfilledChunkKeys = new Set<string>();

    for (const [providerName, samples] of missingByProvider) {
      try {
        const results = await this.embeddingManager.embedManyWithProvider(
          providerName,
          samples.map((s) => s.text)
        );

        samples.forEach((sample, i) => {
          newRecords.push({
            id: crypto.randomUUID(),
            documentId: sample.documentId,
            chunkId: sample.chunkId,
            text: sample.text,
            embedding: results[i]!.embedding,
            metadata: {
              ...sample.metadata,
              embeddingProvider: providerName,
              indexedAt: new Date().toISOString(),
            },
          });
          backfilledChunkKeys.add(`${sample.documentId}::${sample.chunkId}`);
        });
      } catch {
        // That provider is still unavailable (or failed partway through
        // this batch, in which case this run's progress for it is lost —
        // acceptable since this now runs frequently via auto-heal, so the
        // next run picks it back up) — next scheduled run tries again.
      }
    }

    if (newRecords.length > 0) {
      await this.vectorStore.upsert(newRecords);
    }

    return { chunksChecked: byChunk.size, chunksBackfilled: backfilledChunkKeys.size, vectorsAdded: newRecords.length };
  }

  /** Read-only per-provider coverage report for one business — same
   * chunk-grouping logic as backfillAllProviders(), but never embeds
   * anything, just reports what's already there. Backs the Knowledge
   * Hub's "per embedding provider" status table. */
  async coverageStatus(businessId: string): Promise<
    Array<{ provider: string; chunksEmbedded: number; totalChunks: number; lastIndexedAt: string | null }>
  > {
    const all = await this.vectorStore.listAll();
    const scoped = all.filter((r) => r.metadata?.businessId === businessId);

    const byChunk = new Map<string, VectorRecord[]>();
    for (const record of scoped) {
      const key = `${record.documentId}::${record.chunkId}`;
      const list = byChunk.get(key) ?? [];
      list.push(record);
      byChunk.set(key, list);
    }

    const totalChunks = byChunk.size;
    const providerNames = this.embeddingManager.getProviderNames();

    return providerNames.map((providerName) => {
      let chunksEmbedded = 0;
      let lastIndexedAt: string | null = null;

      for (const records of byChunk.values()) {
        // Untagged records predate per-provider tagging and were all
        // embedded by Jina — same convention as json-provider.ts's search().
        const match = records.find(
          (r) => ((r.metadata?.embeddingProvider as string | undefined) ?? "jina") === providerName
        );

        if (match) {
          chunksEmbedded += 1;
          const indexedAt = match.metadata?.indexedAt as string | undefined;
          if (indexedAt && (!lastIndexedAt || indexedAt > lastIndexedAt)) {
            lastIndexedAt = indexedAt;
          }
        }
      }

      return { provider: providerName, chunksEmbedded, totalChunks, lastIndexedAt };
    });
  }
}
