// Re-verified against a real key's GET /v1/models on 2026-09-04 --
// "zai-glm-4.7" (the previous DEFAULT_MODEL) is gone from the catalog
// entirely now, confirming (again) how fast Cerebras' free model list
// churns -- don't assume this list is current either.
//
// IMPORTANT: all three models below currently return HTTP 402 "Payment
// required" on this account, even though Cerebras advertises a free,
// no-card tier -- the account needs billing/verification sorted on
// Cerebras' own side before any of these will actually work. This isn't
// fixable from the code; AIManager already fails over to the other
// healthy providers (groq/gemini/openrouter/mistral) so this doesn't
// block real replies, it just means Cerebras itself sits unused in the
// rotation until that account is sorted. Re-test with a direct curl
// once it is.
export const DEFAULT_MODEL = "gpt-oss-120b";

export const MODELS = [
  "gpt-oss-120b",
  "gemma-4-31b",
  "qwen-3.8-27b",
];
