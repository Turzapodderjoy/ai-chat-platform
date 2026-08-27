/** A single normalized inbound message extracted from a webhook payload —
 * every channel's payload shape is different, so `parseInboundMessage`
 * exists to translate all of them into this one shape before anything
 * downstream (the RAG pipeline, the reply) has to care which channel it
 * came from. */
export interface InboundMessage {
  /** Page ID / IG Business Account ID / WhatsApp phone_number_id — matched
   * against ChannelConnection.externalId to find which business this
   * belongs to. */
  externalId: string;
  /** The customer's platform-specific id — where the reply gets sent. */
  senderId: string;
  text: string;
  /** A directly-fetchable image URL, when the customer sent a photo —
   * Messenger/Instagram attachment URLs are public CDN links, usable
   * as-is. WhatsApp Cloud API instead only gives a media id here (see
   * imageMediaId) since its media requires an authenticated fetch. */
  imageUrl?: string;
  /** WhatsApp Cloud API's media id for an inbound image — resolved to a
   * real fetchable URL via the adapter's own resolveImageUrl (needs the
   * connection's access token, which parseInboundMessage doesn't have
   * access to) before reaching the chat pipeline. */
  imageMediaId?: string;
}

/** What a channel adapter needs to send a reply or identify itself — the
 * subset of a ChannelConnection row an adapter actually uses. */
export interface ChannelConnectionInfo {
  businessId: string;
  channel: string;
  externalId: string;
  accessToken: string;
  config?: Record<string, unknown> | null;
}

/** The platform-wide (not per-client) Meta App credentials, entered once
 * via the mother dashboard. */
export interface PlatformAppCredential {
  appId: string;
  appSecret: string;
  webhookVerifyToken: string;
}

export interface OAuthExchangeResult {
  externalId: string;
  externalLabel: string;
  accessToken: string;
  config?: Record<string, unknown>;
}

/**
 * One adapter class per messaging channel — same "catalog" pattern as
 * AIProvider/EmbeddingProvider. Adding a new channel later means writing
 * one adapter implementing this interface and adding one entry to
 * CHANNEL_CATALOG; nothing else in the app changes.
 *
 * Every method past `id`/`label`/`requiresPlatformApp` is optional
 * because channels connect differently: the website channel needs only
 * `getEmbedSnippet`, WhatsApp's manual-entry flow needs only
 * `sendMessage`/`parseInboundMessage`/`verifyWebhookChallenge` (no OAuth),
 * and Messenger/Instagram need the full OAuth + webhook set.
 */
export interface ChannelAdapter {
  id: string;
  label: string;
  /** Whether connecting this channel requires a platform-wide
   * ChannelAppCredential (App ID/Secret) to have been set up first —
   * drives whether the dashboard shows a "Connect" button or a manual
   * form. */
  requiresPlatformApp: boolean;

  /** Website only — the literal embed snippet for this business, ready
   * to paste onto their site. */
  getEmbedSnippet?(businessId: string, baseUrl: string): string;

  /** OAuth channels — builds the Meta authorization URL. `state` carries
   * the businessId through the redirect so the callback knows which
   * client this connection belongs to. */
  buildConnectUrl?(businessId: string, redirectUri: string, appId: string): string;

  /** OAuth callback — exchanges the returned code for a durable access
   * token and resolves the connected account's id + display name. */
  exchangeCodeForConnection?(
    code: string,
    app: PlatformAppCredential,
    redirectUri: string
  ): Promise<OAuthExchangeResult>;

  /** Meta's webhook verification handshake (GET with hub.mode/
   * hub.verify_token/hub.challenge) — returns the challenge string to
   * echo back if the verify token matches, null otherwise. */
  verifyWebhookChallenge?(query: URLSearchParams, verifyToken: string): string | null;

  /** Normalizes a webhook POST body into zero or more inbound messages. */
  parseInboundMessage?(payload: unknown): InboundMessage[];

  /** WhatsApp Cloud API only — resolves an InboundMessage.imageMediaId
   * into a real, fetchable image URL via the Graph API's two-step media
   * lookup (get a short-lived download URL by id, that URL itself still
   * needs the same access token to actually fetch). Null on any
   * failure — the caller falls back to text-only handling. */
  resolveImageUrl?(connection: ChannelConnectionInfo, mediaId: string): Promise<string | null>;

  /** Sends a reply back through this channel's Send API. */
  sendMessage?(connection: ChannelConnectionInfo, recipientId: string, text: string): Promise<void>;
}
