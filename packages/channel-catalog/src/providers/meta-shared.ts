import type { PlatformAppCredential } from "../types";

/** Meta Graph API version used across Messenger/Instagram/WhatsApp — one
 * constant so bumping it later is a one-line change. */
export const GRAPH_API_VERSION = "v21.0";

export function buildFacebookOAuthUrl(params: {
  appId: string;
  redirectUri: string;
  businessId: string;
  scope: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    state: params.businessId,
    scope: params.scope,
    response_type: "code",
  });

  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${query.toString()}`;
}

export async function exchangeCodeForUserToken(
  code: string,
  app: PlatformAppCredential,
  redirectUri: string
): Promise<string> {
  const query = new URLSearchParams({
    client_id: app.appId,
    client_secret: app.appSecret,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?${query.toString()}`
  );

  if (!res.ok) {
    throw new Error(`Meta OAuth token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** Every Facebook Page connected to the authorizing user, with a
 * page-scoped access token for each — Messenger sends through the Page's
 * token, and Instagram's connected business account hangs off the same
 * Page object. */
export async function listPages(
  userAccessToken: string
): Promise<Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }>> {
  const query = new URLSearchParams({
    access_token: userAccessToken,
    fields: "id,name,access_token,instagram_business_account",
  });

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?${query.toString()}`);

  if (!res.ok) {
    throw new Error(`Meta Graph /me/accounts failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    data: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }>;
  };
  return data.data;
}

export async function sendGraphMessage(params: {
  recipientPath: string; // e.g. "me/messages" for Messenger/Instagram, or "{phoneNumberId}/messages" for WhatsApp
  accessToken: string;
  body: Record<string, unknown>;
}): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${params.recipientPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify(params.body),
  });

  if (!res.ok) {
    throw new Error(`Meta Graph send failed: ${res.status} ${await res.text()}`);
  }
}

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/** WhatsApp Cloud API's two-step authenticated media fetch — a media id
 * only resolves to a real download URL via one Graph call, and that URL
 * itself still needs the same Bearer token to actually fetch (unlike
 * Messenger/Instagram's public CDN attachment URLs). Returns a data:
 * URI (not the remote URL) so VisionService never has to know WhatsApp
 * media needs auth at all — see its own comment. Null on any failure;
 * callers fall back to text-only handling rather than failing the turn. */
export async function resolveWhatsAppMediaAsDataUri(mediaId: string, accessToken: string): Promise<string | null> {
  try {
    const lookupRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!lookupRes.ok) return null;
    const { url, mime_type, file_size } = (await lookupRes.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!url) return null;
    if (file_size && file_size > MAX_MEDIA_BYTES) return null;

    const mediaRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!mediaRes.ok) return null;
    const buffer = Buffer.from(await mediaRes.arrayBuffer());
    if (buffer.byteLength > MAX_MEDIA_BYTES) return null;

    const mimeType = mime_type ?? mediaRes.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Meta's webhook verification handshake — identical GET challenge format
 * across Messenger/Instagram/WhatsApp. */
export function verifyMetaWebhookChallenge(query: URLSearchParams, verifyToken: string): string | null {
  const mode = query.get("hub.mode");
  const token = query.get("hub.verify_token");
  const challenge = query.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return challenge;
  }

  return null;
}
