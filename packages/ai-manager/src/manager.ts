import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderKey,
} from "@ai-chat-platform/types";
import {
  AllProvidersFailedError,
  InvalidApiKeyError,
  ProviderUnavailableError,
  RateLimitedError,
} from "./errors";
import { HealthTracker } from "./health-tracker";
import { KeyManager } from "./key-manager";
import { retryWithBackoff } from "./retry";

interface AIManagerOptions {
  failoverOrder?: string[];
  keyCooldownMs?: number;
  maxRetriesPerKey?: number;
}

interface RegisteredProvider {
  provider: AIProvider;
  keyManager: KeyManager;
}

export class AIManager {
  private readonly providers = new Map<string, RegisteredProvider>();
  private readonly healthTracker: HealthTracker;
  private readonly failoverOrder: string[];
  private readonly keyCooldownMs: number;
  private readonly maxRetriesPerKey: number;

  constructor(options: AIManagerOptions = {}) {
    this.failoverOrder =
      options.failoverOrder?.map((name) => name.toLowerCase()) ?? [];
    this.keyCooldownMs = options.keyCooldownMs ?? 30_000;
    this.maxRetriesPerKey = options.maxRetriesPerKey ?? 1;
    this.healthTracker = new HealthTracker();
  }

  registerProvider(provider: AIProvider, keys: ProviderKey[]): void {
    const name = provider.name.toLowerCase();

    if (this.providers.has(name)) {
      throw new Error(`Provider ${provider.name} is already registered.`);
    }

    const keyManager = new KeyManager(this.keyCooldownMs);
    keyManager.registerKeys(name, keys);

    this.providers.set(name, {
      provider,
      keyManager,
    });
  }

  getProviders(): AIProvider[] {
    return Array.from(this.providers.values()).map(
      (entry) => entry.provider
    );
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (this.providers.size === 0) {
      throw new Error("No AI providers registered.");
    }

    const failures: Error[] = [];

    for (const entry of this.orderedProviders()) {
      const provider = entry.provider;
      const providerName = provider.name;

      if (!(await this.isProviderHealthy(entry))) {
        continue;
      }

      if (!entry.keyManager.hasAnyUsableKey(providerName)) {
        failures.push(
          new ProviderUnavailableError(
            `Provider ${providerName} has no usable API keys.`
          )
        );
        continue;
      }

      let key = entry.keyManager.getAvailableKey(providerName);

      while (key) {
        const currentKey = key;

        try {
          const response = await retryWithBackoff(
            () => provider.generate(request, currentKey.value),
            {
              attempts: this.maxRetriesPerKey + 1,
              baseDelayMs: 100,
              maxDelayMs: 1000,
              shouldRetry: (error) =>
                error instanceof RateLimitedError,
            }
          );

          if (!response.success) {
            entry.keyManager.markKeyFailed(
              providerName,
              currentKey.id
            );

            failures.push(
              new ProviderUnavailableError(
                `Provider ${providerName} returned an unsuccessful response.`
              )
            );

            key = entry.keyManager.getAvailableKey(providerName);
            continue;
          }

          entry.keyManager.markKeySuccess(
            providerName,
            currentKey.id
          );

          this.healthTracker.recordSuccess(providerName);

          return response;
        } catch (cause) {
          const error =
            cause instanceof Error
              ? cause
              : new Error(String(cause));

          if (error instanceof InvalidApiKeyError) {
            entry.keyManager.markKeyFailed(
              providerName,
              currentKey.id,
              true
            );

            failures.push(error);

            key = entry.keyManager.getAvailableKey(providerName);
            continue;
          }

          if (error instanceof RateLimitedError) {
            entry.keyManager.markKeyFailed(
              providerName,
              currentKey.id
            );

            this.healthTracker.recordFailure(providerName);

            failures.push(error);

            key = entry.keyManager.getAvailableKey(providerName);
            continue;
          }

          this.healthTracker.recordFailure(providerName);

          failures.push(error);

          key = entry.keyManager.getAvailableKey(providerName);
        }
      }
    }

    throw new AllProvidersFailedError(failures);
  }

  async chat(
    message: string
  ): Promise<{ provider: string; response: string }> {
    const result = await this.generate({
      userId: "anonymous",
      sessionId: "anonymous",
      message,
    });

    return {
      provider: result.provider,
      response: result.message,
    };
  }

  private orderedProviders(): RegisteredProvider[] {
    if (this.failoverOrder.length === 0) {
      return Array.from(this.providers.values());
    }

    const ordered: RegisteredProvider[] = [];
    const remaining = new Map(this.providers);

    for (const name of this.failoverOrder) {
      const registered = remaining.get(name.toLowerCase());

      if (registered) {
        ordered.push(registered);
        remaining.delete(name.toLowerCase());
      }
    }

    ordered.push(...remaining.values());

    return ordered;
  }

  private async isProviderHealthy(
    entry: RegisteredProvider
  ): Promise<boolean> {
    const providerName = entry.provider.name;

    if (!this.healthTracker.isAvailable(providerName)) {
      return false;
    }

    if (typeof entry.provider.health !== "function") {
      return true;
    }

    try {
      return await entry.provider.health();
    } catch {
      return false;
    }
  }
}