import { AIProvider } from "@ai-chat-platform/types";

export class AIManager {
  private providers: AIProvider[] = [];

  register(provider: AIProvider) {
    this.providers.push(provider);
  }

  getProviders() {
    return this.providers;
  }
}