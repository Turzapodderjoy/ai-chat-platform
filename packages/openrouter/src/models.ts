// OpenRouter's free-tier model lineup rotates as providers add/retire
// slugs (llama-3.3-70b-instruct:free, gemini-2.0-flash-exp:free, and
// now openai/gpt-oss-20b:free have all stopped resolving in turn — the
// last one moved to a paid-only slug, confirmed live 2026-09-04, real
// customer messages were failing on it) — verified against the live
// /api/v1/models list before picking these two.
export const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free";

// MiMo-V2.5 via OpenRouter — native multimodal (vision) support.
// Used when a customer sends a photo and visionMode is "mimo".
export const VISION_MODEL = "xiaomi/mimo-v2.5";

export const MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  VISION_MODEL,
];
