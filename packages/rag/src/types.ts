export interface AskRequest {
  sessionId: string;
  message: string;
}

export interface AskResponse {
  answer: string;
}