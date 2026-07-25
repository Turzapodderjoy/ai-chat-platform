export interface AIRequest {
  prompt: string;
}

export interface AIResponse {
  content: string;
  provider: string;
  model: string;

  inputTokens: number;
  outputTokens: number;

  finishReason: string;
}

export interface ProviderConfig {
  name: string;

  priority: number;

  models: string[];
}