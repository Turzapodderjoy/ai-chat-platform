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

  async upsert(records: VectorRecord[]): Promise<void> {
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

    if (records.length === 0) {
      return [];
    }

    const results = records
      .map((record) => ({
        ...record,
        score: this.cosineSimilarity(embedding, record.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      const valA = a[i] ?? 0;
      const valB = b[i] ?? 0;
      dotProduct += valA * valB;
    }

    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let i = 0; i < a.length; i++) {
      const valA = a[i] ?? 0;
      const valB = b[i] ?? 0;
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

  private async read(): Promise<VectorRecord[]> {
    try {
      const text = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(text);
    } catch {
      return [];
    }
  }
}