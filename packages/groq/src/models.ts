// Re-verified against a real key's GET /v1/models on 2026-09-04 --
// neither "llama-3.3-70b-versatile" nor "llama-3.1-8b-instant" (the
// previous list) exist in Groq's catalog anymore at all (real live
// customer messages were 404ing on this for who knows how long). Groq's
// free/available model list rotates fast; don't assume this one is
// current either -- re-check via a direct GET /v1/models call if this
// provider starts failing again.
//
// gpt-oss-120b (tried first) hit a real 413 on a real customer prompt:
// this account's free tier caps that model at 8,000 tokens/minute, and
// a normal AIVA prompt with retrieved knowledge-base context ran
// ~11,700 -- confirmed live, not a fluke. The 20b model has enough
// headroom for typical prompt sizes.
export const DEFAULT_MODEL =
  "openai/gpt-oss-20b";

export const MODELS = [
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-120b",
];