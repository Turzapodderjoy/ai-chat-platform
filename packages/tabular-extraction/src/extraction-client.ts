import Groq from "groq-sdk";
import * as XLSX from "xlsx";

import { KeyRotator } from "./key-rotator";

// Own dedicated key (GROQ_EXTRACTION_API_KEY) — runs on every crawl and
// every document upload, for every business, so it must never compete
// with live-chat or Chat Learning's quota. Groq, not Gemini — a real
// Gemini API key was tried first and hit its free-tier's 20
// requests/day cap on the very first test run; Groq's free tier is far
// more generous and was already validated live (24/24 real products,
// 5/5 multilingual synthetic listings, zero site-specific tuning).
const MODEL = "llama-3.3-70b-versatile";

// A content block with no clear list of distinct items (an About Us
// page, a return policy, a single-paragraph FAQ answer) has nothing to
// structure — forcing it into a one-row CSV would be worse than plain
// chunking, not better. The model says so explicitly rather than us
// guessing from the output shape.
const NOT_TABULAR_SENTINEL = "NOT_TABULAR";

// The Groq SDK has no default timeout — a stuck connection here hangs
// this call (and everything awaiting it: the crawl's indexing step, the
// whole runCrawl() loop) indefinitely with no error, no log, no retry.
// Same reasoning as the crawler's own FETCH_TIMEOUT_MS. Bounding it does
// NOT touch pacing/rotation/cooldowns — a timed-out call just falls
// through to the existing catch, same as any other extraction failure.
const EXTRACTION_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You extract product/item facts from raw scraped webpage or document text into CSV rows — ONE row per distinct product or item, even if the page only describes a single one (a single product's own page is exactly as valid a target as a listing of many).
The text may be flattened (HTML tags stripped, whitespace collapsed) so it can run on without clear line breaks. It may be in English, Bangla (Bengali script), Banglish (Bangla written in Latin letters), or a mix of all three within the same listing.

If this text describes no identifiable product/item at all (e.g. it's a policy page, an About Us page, a single FAQ answer, generic navigation/menu text) — output exactly the single word ${NOT_TABULAR_SENTINEL} and nothing else.

Otherwise — whether this is one product's own page or a list of many — decide the CSV columns from what's ACTUALLY present in the content — every distinct piece of information about an item (name, price, stock status, size/weight, brand, SKU, description, delivery info, specs, etc.) becomes its own column. Every row must have every column that ANY row needs, even if blank for some rows. Don't invent columns that aren't backed by the text. A single-product page still gets its own one-row table — name and price are almost always present on a real product page and must not be dropped.

Translate values into clear English for the column HEADERS (so "দাম"/"দাম:" -> "Price", "স্টক"/"স্টক অবস্থা" -> "Stock") but keep item names/descriptions in their original language/register if that's how a customer would recognize them. Numbers/prices: extract the number only, no currency symbols/commas, normalized to plain Western digits regardless of source script. Stock/availability status: always normalize the VALUE itself to exactly "In stock" or "Out of stock" in English, regardless of what language/wording the source used.

Output ONLY the CSV (or the ${NOT_TABULAR_SENTINEL} sentinel) — no commentary, no markdown code fences.`;

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
}

export class TabularExtractionClient {
  private readonly keys: KeyRotator;

  /** Accepts one key or several — a real, confirmed-live incident found
   * a single key's 429s were the account's DAILY token cap (Groq free
   * tier: 100,000 tokens/day), not a per-minute spike ("try again in
   * 31m" in the actual error), so no amount of same-key backoff/retry
   * helps mid-crawl. Several keys let KeyRotator hop to a genuinely
   * fresh quota the moment one is exhausted instead of stalling
   * extraction for the rest of the day. */
  constructor(apiKeyOrKeys: string | string[]) {
    const keys = (Array.isArray(apiKeyOrKeys) ? apiKeyOrKeys : [apiKeyOrKeys]).filter(Boolean);
    this.keys = new KeyRotator(keys);
  }

  /** Per-key health, for the Embedding Providers dashboard tab — see
   * KeyRotator.getStatus's own comment on what "healthy" means here
   * (last-attempt outcome, not a live probe). */
  getKeyStatus() {
    return this.keys.getStatus();
  }

  /** Never throws — a failed/misconfigured/rate-limited extraction call
   * must never be able to break an upload or crawl. Returns null on any
   * failure, on the NOT_TABULAR sentinel, or on an empty result; callers
   * fall back to normal chunking in that case. */
  async extract(text: string): Promise<ExtractedTable | null> {
    if (!this.keys.hasKeys) return null;

    const response = await this.keys.run((apiKey) => {
      const client = new Groq({ apiKey, timeout: EXTRACTION_TIMEOUT_MS });
      return client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        temperature: 0,
        max_tokens: 4000,
      });
    });

    if (!response) return null;
    const raw = (response.choices[0]?.message?.content ?? "").trim();

    if (!raw || raw === NOT_TABULAR_SENTINEL || raw.includes(NOT_TABULAR_SENTINEL)) {
      return null;
    }

    // Strip a markdown code fence if the model added one despite being
    // told not to — defensive, not relied on.
    const csv = raw.replace(/^```(?:csv)?\n?/, "").replace(/\n?```$/, "");

    try {
      const workbook = XLSX.read(csv, { type: "string" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return null;
      }

      const rows: string[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, {
        header: 1,
        defval: "",
        raw: false,
      });

      const [headerRow, ...dataRows] = rows;
      if (!headerRow || headerRow.length === 0 || dataRows.length === 0) {
        return null;
      }

      return {
        headers: headerRow.map((h) => String(h)),
        rows: dataRows.map((row) => row.map((cell) => String(cell))),
      };
    } catch {
      return null;
    }
  }
}
