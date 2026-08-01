export interface ChatRequest {
  sessionId: string;

  message: string;

  businessId?: string;

  /** Training Arena sessions only — set once, on the first message of a
   * new sessionId. Skips the "already connected to a human agent" block
   * after a handoff, since the whole point is to keep talking to the AI
   * to correct exactly that behavior. Never set by real customer chat. */
  isTraining?: boolean;

  /** "website" (default) | "messenger" | "instagram" | "whatsapp" — only
   * meaningful on the first message of a new sessionId (getOrCreate is a
   * no-op on an existing conversation). */
  channel?: string;
  /** The customer's platform-specific id (Messenger PSID / IG-scoped id /
   * WhatsApp wa_id) — where a human agent's reply gets sent on that
   * channel. Only set for non-website channels. */
  externalUserId?: string | null;
}

export interface ChatResponse {
  answer: string;
  provider: string;
  tokens: number;
  confidence: number;
  cached?: boolean;
  handoff?: boolean;
  /** The persisted assistant Message's id — lets the caller (Chat Demo's
   * QA buttons) attach pass/fail feedback to this exact answer. Absent
   * for the "already waiting on a human agent" path, which records no
   * new message. */
  messageId?: string;
}