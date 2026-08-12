import { Chunker, chunkTabularTable, type TextChunk } from "@ai-chat-platform/chunker";
import type { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import type { TabularExtractionClient } from "@ai-chat-platform/tabular-extraction";

import type { VectorStoreManager } from "@ai-chat-platform/vector-store";
import type { VectorRecord } from "@ai-chat-platform/vector-store";

import type {
  IndexRequest,
  IndexResult,
} from "./types";

// Above this, a single extraction prompt would be carrying more content
// than is reasonable for one call (cost, latency, and reliability all
// degrade) — skip extraction and fall through to normal chunking rather
// than silently truncating and extracting a partial/misleading table.
// ~15K tokens, comfortably inside Gemini Flash's context with room for a
// large response.
const EXTRACTION_CHAR_CAP = 60_000;

export class IndexingService {
  private readonly chunker =
    new Chunker();

  // Takes the shared, already-registered EmbeddingManager and
  // VectorStoreManager (both built once in bootstrap/create-app.ts)
  // instead of constructing their own — a private `new VectorStoreManager
  // (new JsonProvider())` here used to mean this class read/wrote its own
  // separate instance of the store from every other construction site.
  // extractionClient is optional so tests/callers that don't care about
  // LLM structuring can omit it and just get normal char-based chunking.
  constructor(
    private readonly embeddingManager: EmbeddingManager,
    private readonly vectorStore: VectorStoreManager,
    private readonly extractionClient?: TabularExtractionClient
  ) {}

  /** Tries to turn free text into one consolidated CSV chunk (the whole
   * table in one shot — see chunkTabularTable) via the LLM extraction
   * client before falling back to the plain char-based chunker. Null
   * whenever extraction isn't applicable or didn't find a clear listing
   * — see TabularExtractionClient.extract's own contract for why that's
   * common and expected, not a failure. */
  private async tryExtraction(text: string): Promise<TextChunk[] | null> {
    if (!this.extractionClient || text.length > EXTRACTION_CHAR_CAP) {
      return null;
    }

    const result = await this.extractionClient.extract(text);
    if (!result) {
      return null;
    }

    return chunkTabularTable(result.headers, result.rows);
  }

  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
  }

  async index(
    request: IndexRequest
  ): Promise<IndexResult> {

    // Extraction is ADDITIVE, never a replacement — every detail on a
    // page/document must end up indexed somewhere, and an LLM extraction
    // pass can miss things (page-level description text, a disclaimer, a
    // spec that didn't fit the row shape it chose). So whenever
    // extraction finds a listing, its clean per-item rows are indexed
    // ALONGSIDE the full original text getting chunked normally too, not
    // instead of it — the only case that skips normal chunking is
    // request.preChunked (a real CSV/XLSX upload, where the rows already
    // ARE the complete data, nothing left over to lose).
    const extracted = request.preChunked
      ? null
      : (request.preExtracted ?? (request.skipExtraction ? null : await this.tryExtraction(request.text)));
    const charChunks = request.preChunked ? null : this.chunker.chunk(request.text);
    const chunks: TextChunk[] = request.preChunked ?? (extracted ? [...extracted, ...charChunks!] : charChunks!);

    // Not caller-supplied — computed per-chunk from which branch above
    // actually produced it, so the Knowledge Hub can show which chunks
    // came from AI structuring vs. plain chunking without guessing from
    // content. Extraction and char-chunking can both be present at once
    // (see above), so this has to be tracked per chunk id, not once for
    // the whole request.
    const extractedIds = new Set((extracted ?? []).map((c) => c.id));
    const chunkingMethodFor = (chunk: TextChunk) =>
      request.preChunked ? "caller-tabular" : extractedIds.has(chunk.id) ? "llm-extracted" : "char-chunked";

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
          chunkingMethod: chunkingMethodFor(chunk),
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
      createdAt: new Date(),
      extracted: extracted !== null
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
    // Same DB-level scoping as coverageStatus() — see its comment.
    const scoped = businessId
      ? await this.vectorStore.listAllForBusiness(businessId)
      : await this.vectorStore.listAll();

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
    // Scoped at the DB query level, not listAll() + JS filter — auto-heal
    // calls this once per business in a loop, so an unscoped full-
    // platform scan repeated per business was the real cause of a
    // confirmed live 52s "Run now" hang (and browser tab freeze) once one
    // business's chunk count grew large.
    const scoped = await this.vectorStore.listAllForBusiness(businessId);

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
