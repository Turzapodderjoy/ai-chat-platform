import { GoogleGenAI } from "@google/genai";
import type { ProviderKeyStore } from "@ai-chat-platform/provider-keys";

// Same "-latest" alias reasoning as gemini/models.ts's DEFAULT_MODEL —
// Google periodically retires dated model names, the alias keeps
// pointing at whatever current Flash model is live (all current Gemini
// Flash models are natively multimodal, no separate "vision model").
const VISION_MODEL = "gemini-flash-latest";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface ImageDescription {
  /** A short visual description (type, color, material, distinguishing
   * features) — embedded and searched against the knowledge base the
   * same way a typed product question is, so a photo with no text at
   * all can still surface the closest-matching catalog item(s). */
  description: string;
  /** Any legible text/price/model number actually printed in the photo
   * (a price tag, a label, a spec sheet) — the reliable "OCR" half of
   * this feature, folded into the same search query. Empty string when
   * nothing is legible. */
  readText: string;
}

const PROMPT = `Describe this photo for a product-matching search. Respond ONLY with JSON, no markdown fences, exactly this shape:
{"description": "1-2 sentence visual description: item type, color, material, brand marks, distinguishing features", "readText": "any legible text, price, or model number visible in the image, verbatim; empty string if none"}`;

/** Turns a customer-sent photo into searchable text — the bridge between
 * "here's a picture" and the existing text-based RAG pipeline. Not a
 * separate image-embedding/CLIP-style similarity system: this
 * deliberately reuses 100% of the existing knowledge-base retrieval
 * (same embedding providers, same vector store, same businessId
 * scoping) by turning both product photos (indexed once, see
 * ProductSyncService's captioning hook) and the customer's photo (at
 * chat time) into descriptive text first. Cheaper to build and ship
 * correctly than a real image-embedding index, and in practice a
 * product's own distinguishing text (brand, model, color, printed
 * labels) is exactly what a caption captures anyway. */
export class VisionService {
  constructor(private readonly providerKeys: ProviderKeyStore) {}

  /** Null when no Gemini key is configured, the image can't be fetched,
   * or the model's response isn't parseable — callers treat this as
   * "couldn't see the image" and fall back to text-only handling rather
   * than blocking the chat turn. */
  async describeImage(imageUrl: string): Promise<ImageDescription | null> {
    // Same "persisted (DB) wins, else env var" fallback as
    // registerProviders() uses for the live chat AI pool — a dashboard-
    // activated key is Postgres-only; most deployments (including this
    // one) actually run gemini off GEMINI_API_KEY in .env with no DB
    // row at all, so checking only the DB silently found no key ever.
    const keys = await this.providerKeys.getAll("ai");
    const apiKey = keys["gemini"] ?? process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    let mimeType: string;
    let base64: string;
    try {
      // WhatsApp Cloud API media can't be fetched anonymously (needs a
      // Bearer token) — the whatsapp adapter's resolveImageUrl already
      // downloads it server-side and hands back a data: URI instead of
      // a remote URL, so this just decodes it directly rather than
      // trying to re-fetch it.
      const dataUriMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUriMatch) {
        mimeType = dataUriMatch[1]!;
        base64 = dataUriMatch[2]!;
        if (Buffer.byteLength(base64, "base64") > MAX_IMAGE_BYTES) return null;
      } else {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) return null;
        const contentLength = Number(imgRes.headers.get("content-length") ?? "0");
        if (contentLength > MAX_IMAGE_BYTES) return null;
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        if (buffer.byteLength > MAX_IMAGE_BYTES) return null;
        mimeType = imgRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
        base64 = buffer.toString("base64");
      }
    } catch {
      return null;
    }

    const client = new GoogleGenAI({ apiKey });

    // One retry after a short backoff — Gemini Flash's own "high
    // demand, try again later" 503 is confirmed common enough in
    // practice (hit repeatedly live testing this) that a single
    // attempt would silently drop a real fraction of photo lookups.
    // Not unbounded: two tries total, same "bounded, not a guarantee"
    // posture as the language-check retry elsewhere in this codebase.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await client.models.generateContent({
          model: VISION_MODEL,
          contents: [
            {
              role: "user",
              parts: [{ text: PROMPT }, { inlineData: { mimeType, data: base64 } }],
            },
          ],
        });

        const raw = (response.text ?? "").trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { description: raw.slice(0, 300), readText: "" };

        const parsed = JSON.parse(jsonMatch[0]) as { description?: string; readText?: string };
        return {
          description: parsed.description?.trim() || raw.slice(0, 300),
          readText: parsed.readText?.trim() || "",
        };
      } catch (err) {
        const status = (err as { status?: number })?.status;
        console.error(`[vision] attempt ${attempt} failed, status=${status}:`, err instanceof Error ? err.message : err);
        const retryable = status === 503 || status === 429;
        if (attempt === 0 && retryable) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        return null;
      }
    }
    return null;
  }
}
