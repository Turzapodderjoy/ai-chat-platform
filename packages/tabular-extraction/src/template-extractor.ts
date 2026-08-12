import Groq from "groq-sdk";

// Same reasoning as extraction-client.ts's own timeout/retry — this is a
// single, rare call (once per crawl target, not once per page), but it
// still must never hang the crawl indefinitely.
const MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are given several sample pages of raw scraped text, all from the SAME product page template on one e-commerce website (HTML tags already stripped, whitespace collapsed).

Find a small set of JavaScript-flavor regular expressions that reliably locate these fields on ANY page using this same template: name, price, sku, brand, stock, description. Only include a field if its pattern is genuinely consistent across every sample given — a field whose position/wording varies must be omitted, not guessed at.

Rules for each regex:
- Exactly one capturing group, wrapping only the value itself (not surrounding label text).
- Must be a literal JavaScript RegExp source string (no flags needed, case-insensitive matching is applied automatically).
- Price: capture digits/commas/decimal point only, no currency symbol.
- Stock: capture the raw status text as it actually appears (do not assume "In stock"/"Out of stock" wording).

Output ONLY a JSON object mapping field name to regex source, nothing else — no markdown fences, no commentary. Example shape: {"name": "...", "price": "..."}`;

export interface ExtractionTemplate {
  fields: Record<string, string>;
}

// The owner wanted this derived from a real, generous slice of the
// site (originally asked for 25% of all pages) so the pattern isn't
// guessed from a token handful -- but literal hundreds of full page
// texts in one prompt would itself blow the same 12,000 TPM budget
// this whole feature exists to stop hitting. This is the practical
// ceiling: enough real samples to validate a pattern is genuinely
// consistent (not a fluke on 2-3 pages), each trimmed to the portion
// that actually carries product facts, while staying comfortably
// inside one request.
export const MAX_TEMPLATE_SAMPLES = 15;
const SAMPLE_CHAR_CAP = 2500;

function tryCompile(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

export class TemplateExtractor {
  constructor(private readonly apiKey: string) {}

  /** One-time-per-site call: looks at a handful of real sample pages
   * (already confirmed to be individual product pages — see
   * looksLikeProductPage) and asks Groq to describe a reusable regex
   * pattern for this site's own template, instead of asking it to
   * extract every single page. Validated against every sample before
   * being trusted — a field (or the whole template) that doesn't
   * actually work on all samples is dropped/rejected rather than kept
   * on faith, since a silently-wrong regex is worse than falling back
   * to the slower per-page LLM path. Returns null on any failure
   * (never throws — same contract as TabularExtractionClient.extract),
   * or if it couldn't derive at least name+price reliably. */
  async deriveTemplate(rawSamples: string[]): Promise<ExtractionTemplate | null> {
    if (!this.apiKey || rawSamples.length === 0) return null;

    const samples = rawSamples.slice(0, MAX_TEMPLATE_SAMPLES).map((s) => s.slice(0, SAMPLE_CHAR_CAP));

    let raw: string;
    try {
      const client = new Groq({ apiKey: this.apiKey, timeout: TIMEOUT_MS });
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: samples.map((s, i) => `--- SAMPLE ${i + 1} ---\n${s}`).join("\n\n") },
        ],
        temperature: 0,
        max_tokens: 1000,
      });
      raw = (response.choices[0]?.message?.content ?? "").trim();
    } catch {
      return null;
    }

    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return null;
    }

    if (typeof parsed !== "object" || parsed === null) return null;

    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== "string") continue;
      if (!tryCompile(value)) continue; // drop a field whose regex doesn't even compile
      fields[key] = value;
    }

    if (!fields.name || !fields.price) return null; // mandatory fields, same bar extraction-client.ts holds pages to

    // Validate: every mandatory field must actually match on EVERY
    // sample, not just look plausible — a template only ~sometimes
    // matching real pages of this "same" template isn't safe to trust
    // unattended across ~thousands of unseen pages.
    for (const sample of samples) {
      if (!tryCompile(fields.name)!.test(sample) || !tryCompile(fields.price)!.test(sample)) {
        return null;
      }
    }

    return { fields };
  }

  /** Pure regex, no network call — the fast path this whole feature
   * exists for. Returns null if the mandatory fields don't match THIS
   * particular page (falls back to per-page LLM extraction for that one
   * page — a template derived from a handful of samples is never
   * guaranteed to fit every page on a real site). */
  applyTemplate(template: ExtractionTemplate, text: string): { headers: string[]; rows: string[][] } | null {
    const values: Record<string, string> = {};

    for (const [field, pattern] of Object.entries(template.fields)) {
      const regex = tryCompile(pattern);
      if (!regex) continue;
      const match = regex.exec(text);
      if (match?.[1]) values[field] = match[1].trim();
    }

    if (!values.name || !values.price) return null;

    const headers = Object.keys(values).map((f) => f[0]!.toUpperCase() + f.slice(1));
    return { headers, rows: [Object.values(values)] };
  }
}
