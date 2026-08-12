// Shared by TabularExtractionClient and TemplateExtractor — both hit the
// same GROQ_EXTRACTION_API_KEY pool and the same real failure mode
// confirmed live: a 429 here is usually the account's DAILY token cap
// (100,000/day on Groq's free tier), not a per-minute spike — retrying
// the SAME key with backoff does nothing for that (the message literally
// says "try again in 31m"). Rotating to a genuinely different key
// immediately is the only thing that helps mid-crawl; owner's own fix
// was adding a second key for exactly this.
export interface KeyRotatorStatus {
  maskedKey: string;
  healthy: boolean;
  lastError: string | null;
  lastUsedAt: string | null;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export class KeyRotator {
  private index = 0;
  // Best-effort observability only (see getStatus) -- reflects the
  // outcome of the last attempt with each key, not a live probe. A key
  // that hasn't been tried yet this process reports healthy (optimistic
  // default, same as every other provider's "unknown = assume fine"
  // convention in this codebase).
  private readonly lastError = new Map<number, string>();
  private readonly lastUsedAt = new Map<number, string>();

  constructor(private readonly keys: string[]) {}

  get hasKeys(): boolean {
    return this.keys.length > 0;
  }

  getStatus(): KeyRotatorStatus[] {
    return this.keys.map((key, i) => ({
      maskedKey: maskKey(key),
      healthy: !this.lastError.has(i),
      lastError: this.lastError.get(i) ?? null,
      lastUsedAt: this.lastUsedAt.get(i) ?? null,
    }));
  }

  /** Runs `call` with each key in turn, starting from wherever rotation
   * left off last time (so a working key stays preferred, not re-tried
   * from index 0 every call) — on a 429 from one key, moves to the next
   * immediately; any other error, or exhausting every key, returns null.
   * Never throws. */
  async run<T>(call: (apiKey: string) => Promise<T>): Promise<T | null> {
    if (this.keys.length === 0) return null;

    for (let attempt = 0; attempt < this.keys.length; attempt++) {
      const keyIndex = (this.index + attempt) % this.keys.length;
      try {
        const result = await call(this.keys[keyIndex]!);
        this.index = keyIndex; // stick with the key that just worked
        this.lastError.delete(keyIndex);
        this.lastUsedAt.set(keyIndex, new Date().toISOString());
        return result;
      } catch (err) {
        const status = (err as { status?: number })?.status;
        const message = err instanceof Error ? err.message : String(err);
        this.lastError.set(keyIndex, message.slice(0, 300));
        this.lastUsedAt.set(keyIndex, new Date().toISOString());
        if (status === 429 && attempt < this.keys.length - 1) continue;
        return null;
      }
    }

    return null;
  }
}
