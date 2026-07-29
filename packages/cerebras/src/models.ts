// Verified against a real key's GET /v1/models on 2026-07-28 — the
// original guess ("llama-3.3-70b") isn't in this account's catalog at
// all, confirming the "volatile free model list" warning from research.
//
// IMPORTANT: all three models below currently return HTTP 402 "Payment
// required" on this account, even though Cerebras advertises a free,
// no-card tier — the account needs billing/verification sorted on
// Cerebras' side before any of these will actually work. Re-test with a
// direct curl once that's resolved; don't assume this list is still
// current either, given how fast it already changed once.
export const DEFAULT_MODEL = "zai-glm-4.7";

export const MODELS = [
  "zai-glm-4.7",
  "gpt-oss-120b",
  "gemma-4-31b",
];
