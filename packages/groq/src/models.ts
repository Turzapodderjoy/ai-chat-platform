// Re-verified against a real key's GET /v1/models on 2026-09-04 --
// neither "llama-3.3-70b-versatile" nor "llama-3.1-8b-instant" (the
// previous list) exist in Groq's catalog anymore at all (real live
// customer messages were 404ing on this for who knows how long). Groq's
// free/available model list rotates fast; don't assume this one is
// current either -- re-check via a direct GET /v1/models call if this
// provider starts failing again.
export const DEFAULT_MODEL =
  "openai/gpt-oss-120b";

export const MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
];