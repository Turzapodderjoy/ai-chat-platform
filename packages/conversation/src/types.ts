export interface ConversationMessage {
  role: "system" | "user" | "assistant";

  content: string;

  createdAt: Date;
}

export interface ConversationSession {
  id: string;

  businessId: string;

  userId: string;

  messages: ConversationMessage[];
}