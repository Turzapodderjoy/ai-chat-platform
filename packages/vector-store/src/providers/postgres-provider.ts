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

  async searchMany(
    embeddings: number[][],
    limit = 5,
    businessId?: string,
    embeddingProvider?: string
  ): Promise<SearchResult[][]> {
    if (embeddings.length === 0) {
      return [];
    }

    // Fetched and mapped to records exactly ONCE regardless of how many
    // embeddings are being scored against it — a multi-clause comparison
    // question calling search() once per clause was refetching and
    // rescanning this business's entire vector set redundantly, and that
    // scan is synchronous JS (cosineSimilarity over every row), so it was
    // real, measured latency blocking the whole process, not just this
    // request.
    const rows = await prisma.vectorRecord.findMany({
      where: {
        ...(businessId ? { businessId } : {}),
        // Records indexed before the embeddingProvider tag existed have no
        // tag at all — they were all embedded by Jina (the only provider
        // that existed then), so untagged records must default to "jina"
        // here or every chunk indexed before this change would silently
        // vanish from search results. Same rule json-provider.ts applied.
        ...(embeddingProvider
          ? {
              OR: [
                { embeddingProvider },
                ...(embeddingProvider === "jina"
                  ? [{ embeddingProvider: null }]
                  : []),
              ],
            }
          : {}),
      },
    });

    if (rows.length === 0) {
      return embeddings.map(() => []);
    }

    const records = rows.map((row) => rowToRecord(row));

    return embeddings.map((embedding) =>
      records
        .map((record) => ({
          ...record,
          score: this.cosineSimilarity(embedding, record.embedding),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
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
      // Vector fetched to satisfy the SearchResult/VectorRecord shape —
      // callers of keywordSearch only read text/metadata, never score
      // this against another embedding, so the real column is skipped.
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

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      const valA = a[i] ?? 0;
      const valB = b[i] ?? 0;

      dotProduct += valA * valB;
      magnitudeA += valA * valA;
      magnitudeB += valB * valB;
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }
}
