import type {
  VectorRecord,
  VectorRepository,
} from "./types";

export class InMemoryVectorRepository
  implements VectorRepository
{
  private readonly vectors: VectorRecord[] = [];

  async initialize(): Promise<void> {}

  async add(
    record: VectorRecord
  ): Promise<void> {
    this.vectors.push(record);
  }

  async addMany(
    records: VectorRecord[]
  ): Promise<void> {
    this.vectors.push(...records);
  }

  async getAll(): Promise<VectorRecord[]> {
    return [...this.vectors];
  }

  async clear(): Promise<void> {
    this.vectors.length = 0;
  }
}