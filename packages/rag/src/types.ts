export interface AskRequest {
  sessionId: string;
  message: string;
  businessId?: string;
  isTraining?: boolean;
  channel?: string;
  externalUserId?: string | null;
  languageHint?: string;
  imageUrl?: string;
}

export interface AskSource {
  label: string;
  score: number;
}

export interface AskResponse {
  answer: string;
  provider: string;
  tokens: number;
  confidence: number;
  cached?: boolean;
  handoff?: boolean;
  messageId?: string;
  /** Admin-only visibility (Training Arena, backend admin chat view) —
   * same convention as `provider`: present on every response for either
   * caller, but only ever rendered in the admin dashboards, never the
   * customer-facing widget. */
  sources?: AskSource[];
}