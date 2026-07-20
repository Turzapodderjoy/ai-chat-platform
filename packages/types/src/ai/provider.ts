export interface AIRequest {
  userId: string;
  message: string;
  sessionId: string;
}

export interface AIResponse {
  success: boolean;
  provider: string;
  message: string;
  tokens?: number;
  error?: string;
}

export interface AIProvider {
  readonly name: string;

  generate(request: AIRequest): Promise<AIResponse>;
}