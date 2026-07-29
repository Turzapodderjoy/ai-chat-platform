export interface ChatUsageEntry {
  chatId: string;
  provider: string;
  tokens: number;
  confidence: number;
  createdAt: string;
}

/**
 * In-memory only, capped ring buffer — same caveat as ai-manager's
 * UsageTracker: for a real historical view this needs a persisted
 * table once conversations move to Postgres.
 */
export class ChatUsageLog {
  private readonly entries: ChatUsageEntry[] = [];

  constructor(private readonly maxEntries = 200) {}

  record(entry: ChatUsageEntry): void {
    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  recent(limit = 50): ChatUsageEntry[] {
    return this.entries.slice(-limit).reverse();
  }
}
