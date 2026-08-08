import type {
  VectorStore,
  VectorRecord,
  SearchResult,
} from "./types";

export class VectorStoreManager {
  constructor(
    private provider: VectorStore
  ) {}

  async initialize() {
    return this.provider.initialize();
  }

  async upsert(records: VectorRecord[]) {
    return this.provider.upsert(records);
  }

  async search(
    embedding: number[],
    limit = 5,
    businessId?: string,
    embeddingProvider?: string
  ): Promise<SearchResult[]> {
    return this.provider.search(
      embedding,
      limit,
      businessId,
      embeddingProvider
    );
  }

  async searchMany(
    embeddings: number[][],
    limit = 5,
    businessId?: string,
    embeddingProvider?: string
  ): Promise<SearchResult[][]> {
    return this.provider.searchMany(
      embeddings,
      limit,
      businessId,
      embeddingProvider
    );
  }

  async keywordSearch(
    terms: string[],
    limit = 5,
    businessId?: string
  ): Promise<SearchResult[]> {
    return this.provider.keywordSearch(terms, limit, businessId);
  }

  async listChunksForDocument(
    documentId: string
  ): Promise<{ chunkId: string; text: string; metadata?: Record<string, unknown> }[]> {
    return this.provider.listChunksForDocument(documentId);
  }

  async listTabularChunksForBusiness(
    businessId: string
  ): Promise<{ documentId: string; chunkId: string; text: string; metadata?: Record<string, unknown> }[]> {
    return this.provider.listTabularChunksForBusiness(businessId);
  }

  async listUniqueChunkTexts(businessId: string): Promise<string[]> {
    return this.provider.listUniqueChunkTexts(businessId);
  }

  async listAll(): Promise<VectorRecord[]> {
    return this.provider.listAll();
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    return this.provider.deleteByDocumentId(documentId);
  }

  async deleteByDocumentIds(documentIds: string[]): Promise<void> {
    return this.provider.deleteByDocumentIds(documentIds);
  }

  async updateMetadata(documentId: string, patch: Record<string, unknown>): Promise<void> {
    return this.provider.updateMetadata(documentId, patch);
  }

  async updateMetadataMany(documentIds: string[], patch: Record<string, unknown>): Promise<void> {
    return this.provider.updateMetadataMany(documentIds, patch);
  }
}