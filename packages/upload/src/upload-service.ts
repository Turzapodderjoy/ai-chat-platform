import { IngestionPipeline } from "@ai-chat-platform/ingestion";
import { IndexingService } from "@ai-chat-platform/indexing";
import { chunkTabularTable, type TextChunk } from "@ai-chat-platform/chunker";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";
import { prisma, type Prisma } from "@ai-chat-platform/database";

import type {
  UploadRequest,
  UploadResult,
} from "./types";

export class UploadService {
  constructor(
    private readonly ingestion: IngestionPipeline,
    private readonly indexing: IndexingService,
    private readonly vectorStore: VectorStoreManager
  ) {}

  async upload(
    request: UploadRequest
  ): Promise<UploadResult> {
    await this.indexing.initialize();

    const ingestion =
      await this.ingestion.ingest(
        request.filepath
      );

    // CSV/XLSX rows go in as one consolidated CSV chunk per sheet (never
    // re-split by the char-based Chunker) — the AI gets the whole table
    // in one shot instead of one row at a time. See chunkTabularTable.
    const preChunked: TextChunk[] | undefined = ingestion.document.tabular
      ? ingestion.document.tabular.flatMap((sheet) => chunkTabularTable(sheet.headers, sheet.rows))
      : undefined;

    // Stable per-(business, original filename) documentId — same
    // reasoning as the crawler's `crawl:${id}:${page.url}` (see
    // crawler-service.ts) — so re-uploading an updated version of the
    // same file (e.g. this week's price list) REPLACES its old chunks
    // instead of leaving them live alongside the new ones. Without this,
    // a stale "Price: 500" row and a fresh "Price: 600" row for the same
    // product would both stay searchable forever, and the AI has no way
    // to know which one is current.
    const documentId = `upload:${request.businessId}:${request.originalFilename}`;
    await this.vectorStore.deleteByDocumentId(documentId);

    // Persisted separately from the (fragmented, post-chunking)
    // VectorRecord rows — UPLOAD_DIR is an ephemeral tmp path (see
    // apps/web/lib/paths.ts) that doesn't survive past this request on
    // Vercel, so without this the scheduled knowledge-refresh job would
    // have nothing to re-run extraction against later. tabularRows holds
    // the full per-sheet {sheet,headers,rows}[] structure for a real
    // CSV/XLSX upload (re-serialize directly on refresh, no LLM call
    // needed — deterministic source); null for PDF/DOCX/plain text.
    await prisma.uploadedDocument.upsert({
      where: { businessId_originalFilename: { businessId: request.businessId, originalFilename: request.originalFilename } },
      create: {
        businessId: request.businessId,
        originalFilename: request.originalFilename,
        rawText: ingestion.document.text,
        tabularRows: (ingestion.document.tabular as unknown as Prisma.InputJsonValue) ?? undefined,
      },
      update: {
        rawText: ingestion.document.text,
        tabularRows: (ingestion.document.tabular as unknown as Prisma.InputJsonValue) ?? undefined,
      },
    });

    const result =
      await this.indexing.index({
        filename:
          ingestion.document.filename,
        text:
          ingestion.document.text,
        preChunked,
        documentId,
        metadata: {
          businessId:
            request.businessId,
        },
      });

    return {
      success: true,
      chunks: result.chunks,
    };
  }
}
