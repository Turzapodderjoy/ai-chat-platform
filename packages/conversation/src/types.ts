export type HandoffStatus = "bot" | "pending" | "human";

export interface ConversationMessage {
  id: string;
  role: "system" | "user" | "assistant" | "agent";
  content: string;
  createdAt: Date;
}

export interface ConversationRecord {
  id: string;
  businessId: string;
  userId: string;
  handoffStatus: HandoffStatus;
  handoffReason: string | null;
  handoffSummary: string | null;
  handoffRequestedAt: Date | null;
  isTraining: boolean;
}
