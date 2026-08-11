export type HandoffStatus = "bot" | "pending" | "human";

export interface MessageSource {
  label: string;
  score: number;
  embeddingProvider?: string;
}

export interface ConversationMessage {
  id: string;
  role: "system" | "user" | "assistant" | "agent";
  content: string;
  provider: string | null;
  sources: MessageSource[] | null;
  confidence: number | null;
  createdAt: Date;
}

export interface ConversationRecord {
  id: string;
  businessId: string;
  userId: string;
  channel: string;
  externalUserId: string | null;
  handoffStatus: HandoffStatus;
  handoffReason: string | null;
  handoffSummary: string | null;
  handoffRequestedAt: Date | null;
  isTraining: boolean;
}
