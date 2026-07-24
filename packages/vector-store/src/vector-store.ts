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
    limit = 5
  ): Promise<SearchResult[]> {
    return this.provider.search(
      embedding,
      limit
    );
  }
}