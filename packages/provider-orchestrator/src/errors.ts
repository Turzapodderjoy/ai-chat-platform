export class RateLimitError extends Error {
  constructor(message = "Rate limit exceeded.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export class AuthenticationError extends Error {
  constructor(message = "Authentication failed.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class TimeoutError extends Error {
  constructor(message = "Request timed out.") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class ProviderUnavailableError extends Error {
  constructor(message = "Provider unavailable.") {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}