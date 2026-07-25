import { ProviderRegistry } from "./registry";
import { KeyManager } from "./key-manager";
import { HealthManager } from "./health-manager";

import type {
  AIRequest,
  AIResponse,
} from "./types";

import {
  AuthenticationError,
  ProviderUnavailableError,
  RateLimitError,
  TimeoutError,
} from "./errors";

export class ProviderOrchestrator {
  private registry = new ProviderRegistry();

  private keys = new KeyManager();

  private health = new HealthManager();

  register(provider: any) {
    this.registry.register(provider);
  }

  registerKeys(
    provider: string,
    keys: string[]
  ) {
    this.keys.register(provider, keys);
  }

  async chat(
    request: AIRequest
  ): Promise<AIResponse> {
    const providers =
      this.registry
        .getAll()
        .sort(
          (a, b) =>
            a.config.priority -
            b.config.priority
        );

    for (const provider of providers) {
      if (
        !this.health.isHealthy(
          provider.config.name
        )
      ) {
        continue;
      }

      const key = this.keys.get(
        provider.config.name
      );

      if (!key) {
        continue;
      }

      try {
        return await provider.chat(
          request,
          key.value
        );
      } catch (error) {
        if (error instanceof RateLimitError) {
          continue;
        }

        if (
          error instanceof AuthenticationError
        ) {
          continue;
        }

        if (
          error instanceof TimeoutError ||
          error instanceof
            ProviderUnavailableError
        ) {
          continue;
        }

        continue;
      }
    }

    throw new Error(
      "No AI provider available."
    );
  }
}