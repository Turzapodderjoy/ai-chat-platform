export interface VectorRecord {
  id: string;

  text: string;

  embedding: number[];

  metadata?: Record<string, unknown>;
}

export interface VectorRepository {
  initialize(): Promise<void>;

  add(
    record: VectorRecord
  ): Promise<void>;

  addMany(
    records: VectorRecord[]
  ): Promise<void>;

  getAll(): Promise<VectorRecord[]>;

  clear(): Promise<void>;
}