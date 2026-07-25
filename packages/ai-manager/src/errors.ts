export class AIManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target?.name ?? "AIManagerError";
    Object.setPrototypeOf(this, new.target?.prototype ?? new.target);
  }
}

export class InvalidApiKeyError extends AIManagerError {}

export class RateLimitedError extends AIManagerError {}

export class ProviderUnavailableError extends AIManagerError {}

export class AllProvidersFailedError extends AIManagerError {
  constructor(public readonly failures: Error[]) {
    super("All AI providers failed.");
  }
}
