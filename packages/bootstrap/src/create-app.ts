import { Container } from "./container";
import { Application } from "./app";

/**
 * The one real composition root for production wiring. Nothing here is
 * async anymore — the legacy retriever/embedding/AI provider stack that
 * needed async initialization (embedding manager, vector store, persisted
 * provider keys) was deleted wholesale; Hermes replaces it as the single
 * chat engine. `createApp()` stays awaitable for its callers, so the
 * signature doesn't churn.
 */
export function createApp(): Application {
  return new Application(new Container());
}