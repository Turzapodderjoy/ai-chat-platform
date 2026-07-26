export interface ChatRequest {
  sessionId: string;

  message: string;
}

export interface ChatResponse {
  answer: string;
}