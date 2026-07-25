import type {
  AIRequest,
  AIResponse,
  ProviderConfig,
} from "./types";

export interface AIProvider {
  readonly config: ProviderConfig;

  chat(
    request: AIRequest,
    apiKey: string
  ): Promise<AIResponse>;

  healthCheck(): Promise<boolean>;
}