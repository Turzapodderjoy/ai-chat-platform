// OpenRouter's free-tier model lineup rotates as providers add/retire
// slugs (llama-3.3-70b-instruct:free and gemini-2.0-flash-exp:free both
// stopped resolving) — verified against the live /api/v1/models list
// before picking these two.
export const DEFAULT_MODEL = "openai/gpt-oss-20b:free";

// MiMo-V2.5 via OpenRouter — native multimodal (vision) support.
// Used when a customer sends a photo and visionMode is "mimo".
export const VISION_MODEL = "xiaomi/mimo-v2.5";

export const MODELS = [
  "openai/gpt-oss-20b:free",
  "google/gemma-4-26b-a4b-it:free",
  VISION_MODEL,
];
