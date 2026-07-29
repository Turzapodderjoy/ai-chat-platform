export interface AskRequest {
  sessionId: string;
  message: string;
  businessId?: string;
  isTraining?: boolean;
}

export interface AskResponse {
  answer: string;
  provider: string;
  tokens: number;
  confidence: number;
  cached?: boolean;
  handoff?: boolean;
  messageId?: string;
}