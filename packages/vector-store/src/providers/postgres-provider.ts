import { prisma, Prisma, withSerializableRetry } from "@ai-chat-platform/database";

import type {
  SearchResult,
  VectorRecord,
  VectorStore,
} from "../types";

type Row = {
  id: string;
  documentId: string;
  chunkId: string;
  text: string;
  embedding?: number[];
  businessId: string | null;
  embeddingProvider: string | null;
  metadata: unknown;
};

// businessId/embeddingProvider are hoisted into dedicated columns (the only
// two fields ever filtered on directly); everything else round-trips through
// the metadata JSON column. On write we strip them back out of the incoming
// metadata object before storing it, so on read we can reconstruct the exact
// same shape callers expect (record.metadata.businessId etc.) by spreading
// metadata first and overlaying the dedicated columns — this symmetry is
// what keeps a round-trip exact.
function rowToRecord(row: Row): VectorRecord {
  const baseMetadata = (row.metadata as Record<string, unknown> | null) ?? {};

  return {
    id: row.id,
    documentId: row.documentId,
    chunkId: row.chunkId,
    text: row.text,
    // listAll() deliberately omits this column (see listAll() below) — no
    // consumer of listAll() reads .embedding, only search() does, and
    // search() fetches it explicitly. Leaving it [] here rather than
    // fetching hundreds of KB of float arrays nobody reads is what fixed
    // listAll()-backed endpoints (coverage/knowledge/backfill) going from
    // single-digit-ms (JsonProvider, in-memory) to 20-40s over the wire.
    embedding: row.embedding ?? [],
    metadata: {
      ...baseMetadata,
      businessId: row.businessId ?? undefined,
      embeddingProvider: row.embeddingProvider ?? undefined,
    },
  };
}

function recordToRow(record: VectorRecord) {
  const { businessId, embeddingProvider, ...restMetadata } =
    record.metadata ?? {};

  return {
    id: record.id,
    documentId: record.documentId,
    chunkId: record.chunkId,
    text: record.text,
    embedding: record.embedding,
    businessId: (businessId as string | undefined) ?? null,
    embeddingProvider: (embeddingProvider as string | undefined) ?? null,
    metadata: restMetadata as Prisma.InputJsonValue,
  };
}

const UPSERT_BATCH_SIZE = 500;

export class PostgresProvider implements VectorStore {
  async initialize(): Promise<void> {
    // Schema is created by `prisma db push` / migrations, not at runtime.
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
      const batch = records.slice(i, i + UPSERT_BATCH_SIZE);

      try {
        await withSerializableRetry(() =>
          prisma.$transaction(
            batch.map((record) => {
              const row = recordToRow(record);
              return prisma.vectorRecord.upsert({
                where: { id: row.id },
                create: row,
                update: row,
              });
            })
          )
        );
      } catch (err) {
        // The whole batch is one transaction — one malformed record (e.g.
        // a crawled page whose text trips a Postgres text-literal edge
        // case) would otherwise roll back every other, unrelated record
        // in the same batch too. Fall back to one-by-one so a single bad
        // record is skipped (and logged) instead of silently discarding
        // up to UPSERT_BATCH_SIZE good ones — "no corner left" applies to
        // the good pages in the batch, not just the bad one.
        for (const record of batch) {
          const row = recordToRow(record);
          try {
            await withSerializableRetry(() =>
              prisma.vectorRecord.upsert({ where: { id: row.id }, create: row, update: row })
            );
          } catch (recordErr) {
            console.error(`[PostgresProvider.upsert] record ${row.id} (${row.documentId}) failed, skipped:`, recordErr);
          }
        }
      }
    }
  }

  async search(
    embedding: number[],
    limit = 5,
    businessId?: string,
    embeddingProvider?: string
  ): Promise<SearchResult[]> {
    const [results] = await this.searchMany([embedding], limit, businessId, embeddingProvider);
    return results!;
  }

  /** Uses the pgvector HNSW index ("embeddingVec" column, kept in sync
   * with the plain-array "embedding" column by a DB trigger) instead of
   * fetching every candidate row and scoring it in JS — the old approach
   * was a genuine, measured production incident: a business with ~30k
   * chunks pushed a single chat request to 8GB+ RAM and 90%+ CPU
   * (brute-force cosine over every row, per embedding, per provider,
   * every turn). One indexed query per embedding is now sub-second
   * regardless of how large the business's knowledge base gets — this is
   * what makes "search everything, don't miss anything" actually
   * feasible at this scale instead of an unbounded full-table scan. */
  async searchMany(
    embeddings: number[][],
    limit = 5,
    businessId?: string,
    embeddingProvider?: string
  ): Promise<SearchResult[][]> {
    if (embeddings.length === 0) {
      return [];
    }

    const providerFilter = embeddingProvider
      ? Prisma.sql`AND ("embeddingProvider" = ${embeddingProvider}${
          // Records indexed before the embeddingProvider tag existed have
          // no tag at all — they were all embedded by Jina (the only
          // provider that existed then), so untagged records must default
          // to "jina" here or every chunk indexed before this change
          // would silently vanish from search results.
          embeddingProvider === "jina" ? Prisma.sql` OR "embeddingProvider" IS NULL` : Prisma.empty
        })`
      : Prisma.empty;
    const businessFilter = businessId ? Prisma.sql`AND "businessId" = ${businessId}` : Prisma.empty;

    return Promise.all(
      embeddings.map(async (embedding) => {
        const vectorLiteral = `[${embedding.join(",")}]`;

        const rows = await prisma.$queryRaw<
          Array<{
            id: string;
            documentId: string;
            chunkId: string;
            text: string;
            metadata: unknown;
            score: number;
          }>
        >(Prisma.sql`
          SELECT id, "documentId", "chunkId", text, metadata,
                 1 - ("embeddingVec" <=> ${vectorLiteral}::vector) AS score
          FROM "VectorRecord"
          WHERE "embeddingVec" IS NOT NULL ${businessFilter} ${providerFilter}
          ORDER BY "embeddingVec" <=> ${vectorLiteral}::vector
          LIMIT ${limit}
        `);

        return rows.map((row) => ({
          id: row.id,
          documentId: row.documentId,
          chunkId: row.chunkId,
          text: row.text,
          embedding: [],
          // Every row in this result set was matched against the query
          // scoped to `embeddingProvider` (the WHERE clause above), so
          // it's safe to stamp it directly rather than selecting the
          // column — callers (chat provenance display) need to know
          // which embedding model actually produced this match.
          metadata: {
            ...((row.metadata as Record<string, unknown> | null) ?? {}),
            ...(embeddingProvider ? { embeddingProvider } : {}),
          },
          score: row.score,
        }));
      })
    );
  }

  async keywordSearch(
    terms: string[],
    limit = 5,
    businessId?: string
  ): Promise<SearchResult[]> {
    const cleanTerms = terms.map((t) => t.trim()).filter((t) => t.length >= 3);

    if (cleanTerms.length === 0) {
      return [];
    }

    const rows = await prisma.vectorRecord.findMany({
      where: {
        ...(businessId ? { businessId } : {}),
        OR: cleanTerms.map((term) => ({
          text: { contains: term, mode: "insensitive" as const },
        })),
      },
      // Excludes the embedding column — callers of keywordSearch only
      // read text/metadata, never score this against another embedding.
      // Same reasoning as listAll(); without this a common term matching
      // thousands of rows loads every one of their full embedding
      // vectors into memory for nothing.
      select: {
        id: true,
        documentId: true,
        chunkId: true,
        text: true,
        businessId: true,
        embeddingProvider: true,
        metadata: true,
      },
      // No index makes a leading-wildcard ILIKE cheap for a COMMON term
      // (pg_trgm helps only genuinely selective ones — see
      // packages/database/sql/pgvector-setup.sql) — an ordinary catalog
      // word like "drill" at a tools business matched 32,764/61,846 rows
      // once, a 4.9s unbounded fetch on every message. This `take` lets
      // Postgres stop the scan once it has enough candidates instead of
      // enumerating every match. Safe to bound: this search only
      // supplements the real (unlimited, properly ranked) vector search
      // run in parallel — for the case this exists for, an actual rare
      // product code/SKU, the trgm index already makes it fast AND
      // exhaustive (real single-digit-ms measurement), so the cap never
      // even engages there.
      take: Math.max(limit * 5, 25),
    });

    if (rows.length === 0) {
      return [];
    }

    return rows
      .map((row) => rowToRecord(row))
      .map((record) => {
        const lowerText = record.text.toLowerCase();
        const matched = cleanTerms.filter((term) => lowerText.includes(term.toLowerCase())).length;

        // Kept below typical strong vector-similarity scores (usually
        // 0.6-0.9 for a real match) so a keyword hit supplements rather
        // than displaces genuine semantic matches, but still clears the
        // default minimumScore=0 floor so it always surfaces.
        return { ...record, score: 0.35 + 0.1 * matched };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async listChunksForDocument(
    documentId: string
  ): Promise<{ chunkId: string; text: string; metadata?: Record<string, unknown> }[]> {
    const rows = await prisma.vectorRecord.findMany({
      where: { documentId },
      distinct: ["chunkId"],
    });

    return rows
      .map((row) => rowToRecord(row))
      .map((record) => ({ chunkId: record.chunkId, text: record.text, metadata: record.metadata }))
      .sort((a, b) => {
        const ai = (a.metadata?.chunkIndex as number | undefined) ?? 0;
        const bi = (b.metadata?.chunkIndex as number | undefined) ?? 0;
        return ai - bi;
      });
  }

  async listAllChunksForBusiness(
    businessId: string
  ): Promise<{ documentId: string; chunkId: string; text: string; metadata?: Record<string, unknown> }[]> {
    // Excludes the embedding column — same reasoning as listAll(). Every
    // caller (MasterCsvService.buildCsv) only reads documentId/chunkId/
    // text/metadata; without this select, a business with tens of
    // thousands of chunks loads every one of their full float-array
    // vectors into memory at once, which is exactly what pushed one real
    // CSV build to 4GB RAM and 90% CPU on a business with 25k+ chunks.
    const rows = await prisma.vectorRecord.findMany({
      where: { businessId },
      distinct: ["chunkId"],
      select: { documentId: true, chunkId: true, text: true, metadata: true },
    });

    return rows.map((row) => ({
      documentId: row.documentId,
      chunkId: row.chunkId,
      text: row.text,
      metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    }));
  }

  async listUniqueChunkTexts(businessId: string): Promise<string[]> {
    const rows = await prisma.vectorRecord.findMany({
      where: { businessId },
      distinct: ["chunkId"],
      select: { text: true },
    });

    return rows.map((row) => row.text);
  }

  async listAll(): Promise<VectorRecord[]> {
    // Excludes the embedding column on purpose — see the comment on
    // rowToRecord's `embedding` field above. Every listAll() caller today
    // (coverageStatus/backfill grouping, the Knowledge Hub document list,
    // crawler content-hash diffing) only reads documentId/chunkId/text/
    // metadata, never the actual vector.
    const rows = await prisma.vectorRecord.findMany({
      select: {
        id: true,
        documentId: true,
        chunkId: true,
        text: true,
        businessId: true,
        embeddingProvider: true,
        metadata: true,
      },
    });
    return rows.map((row) => rowToRecord(row));
  }

  async listAllForBusiness(businessId: string): Promise<VectorRecord[]> {
    // Same embedding-column exclusion as listAll(), just scoped to one
    // business at the DB level instead of loading every business's
    // chunks and filtering in JS afterward.
    const rows = await prisma.vectorRecord.findMany({
      where: { businessId },
      select: {
        id: true,
        documentId: true,
        chunkId: true,
        text: true,
        businessId: true,
        embeddingProvider: true,
        metadata: true,
      },
    });
    return rows.map((row) => rowToRecord(row));
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    return this.deleteByDocumentIds([documentId]);
  }

  async deleteByDocumentIds(documentIds: string[]): Promise<void> {
    if (documentIds.length === 0) return;

    await prisma.vectorRecord.deleteMany({
      where: { documentId: { in: documentIds } },
    });
  }

  async updateMetadata(
    documentId: string,
    patch: Record<string, unknown>
  ): Promise<void> {
    return this.updateMetadataMany([documentId], patch);
  }

  async updateMetadataMany(
    documentIds: string[],
    patch: Record<string, unknown>
  ): Promise<void> {
    if (documentIds.length === 0) return;

    const rows = await prisma.vectorRecord.findMany({
      where: { documentId: { in: documentIds } },
    });

    await withSerializableRetry(() =>
      prisma.$transaction(
        rows.map((row) => {
          const merged = rowToRecord(row);
          const updatedRow = recordToRow({
            ...merged,
            metadata: { ...merged.metadata, ...patch },
          });

          return prisma.vectorRecord.update({
            where: { id: row.id },
            data: updatedRow,
          });
        })
      )
    );
  }
}
