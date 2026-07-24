import fs from "fs/promises";
import path from "path";

import type {
  SearchResult,
  VectorRecord,
  VectorStore,
} from "../types";

export class JsonProvider implements VectorStore {
  private filePath = path.join(
    process.cwd(),
    "storage",
    "embeddings",
    "knowledge.json"
  );

  async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), {
      recursive: true,
    });

    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(
        this.filePath,
        JSON.stringify([], null, 2),
        "utf8"
      );
    }
  }

  async upsert(
    records: VectorRecord[]
  ): Promise<void> {
    const current = await this.read();

    current.push(...records);

    await fs.writeFile(
      this.filePath,
      JSON.stringify(current, null, 2),
      "utf8"
    );
  }

  async search(
    embedding: number[],
    limit = 5
  ): Promise<SearchResult[]> {
    const records = await this.read();

    // Search implementation will be added next.
    // For now, return the first records so the pipeline keeps working.
    return records
      .slice(0, limit)
      .map((record) => ({
        ...record,
        score: 0,
      }));
  }

  private async read(): Promise<VectorRecord[]> {
    try {
      const text = await fs.readFile(
        this.filePath,
        "utf8"
      );

      return JSON.parse(text);
    } catch {
      return [];
    }
  }
}