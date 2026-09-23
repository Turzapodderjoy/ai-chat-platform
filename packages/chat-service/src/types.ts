export interface ChatRequest {
  sessionId: string;

  message: string;

  businessId?: string;

  /** Legacy training-session marker persisted on the conversation row.
   * Never set by customer chat today; real conversations leave it unset. */
  isTraining?: boolean;

  /** "website" (default) | "messenger" | "instagram" | "whatsapp" — only
   * meaningful on the first message of a new sessionId (getOrCreate is a
   * no-op on an existing conversation). */
  channel?: string;
  /** The customer's platform-specific id (Messenger PSID / IG-scoped id /
   * WhatsApp wa_id) — where a human agent's reply gets sent on that
   * channel. Only set for non-website channels. */
  externalUserId?: string | null;

  /** "english" | "bangla" — the widget's start-of-chat language picker
   * (see widget.js). A default to reply in, not a lock: the existing
   * "match the customer's current message" rule still overrides this the
   * moment they actually type in a different language. */
  languageHint?: string;

  /** A photo the customer sent this turn (product photo, price tag,
   * screenshot) — a publicly fetchable URL. The chat service appends a
   * photo-note to the message so the agent knows a photo exists (it
   * can't see it) and knows to ask the customer to describe it. */
  imageUrl?: string;
}

export interface ChatResponse {
  answer: string;
  provider: string;
  tokens: number;
  confidence: number;
  cached?: boolean;
  handoff?: boolean;
  /** The persisted assistant Message's id — lets the caller attach
   * feedback to this exact answer. Absent for the "already waiting on a
   * human agent" path, which records no new message. */
  messageId?: string;
}