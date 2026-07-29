// "-latest" alias instead of a pinned version — Google periodically
// retires specific dated models ("gemini-2.5-flash" itself started
// 404ing as "no longer available to new users" even though it's still
// listed by ListModels), the alias keeps pointing at whatever's current.
export const DEFAULT_MODEL = "gemini-flash-latest";

export const MODELS = [
  "gemini-flash-latest",
  "gemini-pro-latest",
];
