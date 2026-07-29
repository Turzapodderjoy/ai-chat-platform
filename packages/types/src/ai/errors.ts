export class AIManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target?.name ?? "AIManagerError";
    Object.setPrototypeOf(this, new.target?.prototype ?? new.target);
  }
}

/** Provider must throw this instead of swallowing the error — it's what
 * tells AIManager to permanently disable the key instead of just cooling
 * it down, so a dead key stops being retried forever. */
export class InvalidApiKeyError extends AIManagerError {}

/** Provider must throw this instead of swallowing the error — it's what
 * tells AIManager this key is temporarily exhausted (cooldown) rather
 * than genuinely broken, and to record the failure for health tracking. */
export class RateLimitedError extends AIManagerError {}

export class ProviderUnavailableError extends AIManagerError {}

export class AllProvidersFailedError extends AIManagerError {
  constructor(public readonly failures: Error[]) {
    // Individual failure reasons used to be swallowed (only available on
    // the .failures array, which nothing surfaced to callers) — folding
    // them into the message means the real per-provider errors actually
    // reach API responses/logs instead of a useless generic string.
    super(
      failures.length === 0
        ? "All AI providers failed."
        : `All AI providers failed: ${failures.map((f) => f.message).join(" | ")}`
    );
  }
}
