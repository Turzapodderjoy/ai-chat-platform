/** Thin REST client for a self-hosted Evolution API gateway
 * (github.com/EvolutionAPI/evolution-api) — an unofficial WhatsApp
 * bridge (Baileys under the hood, no browser) used for testing-only,
 * per-client sessions alongside the official Meta WhatsApp Cloud API
 * integration (whatsapp.ts). Replaces the earlier OpenWA integration —
 * same "one gateway, one instance per business" shape, different REST
 * surface. One Evolution API instance serves every business; each
 * business gets its own Evolution "instance" (one WhatsApp number
 * linked via QR). Base URL + global API key are platform-wide config,
 * read from env like every other provider key. */

function baseUrl(): string {
  return process.env.EVOLUTION_API_BASE_URL ?? "http://localhost:2786";
}

function apiKey(): string {
  const key = process.env.EVOLUTION_API_KEY;
  if (!key) throw new Error("EVOLUTION_API_KEY is not configured.");
  return key;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey(),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error(`Evolution API ${init?.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface EvolutionInstance {
  instanceName: string;
  /** "connecting" (created, not yet paired) | "open" (paired, ready) |
   * "close" (disconnected). Confirmed live against a real instance —
   * not "ready"/"disconnected" like OpenWA used. */
  state: "connecting" | "open" | "close";
}

/** Instance names must be alphanumeric + hyphens — businessId (a cuid)
 * already qualifies, just prefix it so it's recognizable in the
 * Evolution API dashboard. Same convention OpenWA used, kept identical
 * so the swap doesn't need a data migration for existing sessions. */
export function sessionNameForBusiness(businessId: string): string {
  return `biz-${businessId}`;
}

/** Response from POST /instance/create — the QR is generated
 * immediately on creation (confirmed live), unlike OpenWA's separate
 * create-then-start-then-poll-for-qr flow. */
interface CreateInstanceResponse {
  instance: { instanceName: string; state?: string };
  qrcode?: { base64: string; code: string };
}

export async function createOrGetInstance(businessId: string): Promise<{ instanceName: string; qrCode: string | null }> {
  const name = sessionNameForBusiness(businessId);

  try {
    const created = await request<CreateInstanceResponse>("/instance/create", {
      method: "POST",
      // WHATSAPP-BAILEYS is required (confirmed live: omitting `integration`
      // 400s with "Invalid integration") -- the free/unofficial mode, as
      // opposed to WHATSAPP-BUSINESS (the official Cloud API passthrough
      // this platform already has its own separate integration for).
      body: JSON.stringify({ instanceName: name, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
    });
    return { instanceName: name, qrCode: created.qrcode?.base64 ?? null };
  } catch (err) {
    // Already exists -- fetch a fresh QR instead of erroring. Evolution
    // API 403s (not 409 like OpenWA) on a duplicate instanceName.
    if (err instanceof Error && (err.message.includes("403") || err.message.includes("already"))) {
      const qrCode = await getQrCode(name);
      return { instanceName: name, qrCode };
    }
    throw err;
  }
}

export async function getQrCode(instanceName: string): Promise<string | null> {
  try {
    const res = await request<{ base64: string }>(`/instance/connect/${instanceName}`);
    return res.base64 ?? null;
  } catch {
    return null; // not ready yet, or already connected (no QR to give)
  }
}

export async function getConnectionState(instanceName: string): Promise<EvolutionInstance["state"] | null> {
  try {
    const res = await request<{ instance: { instanceName: string; state: EvolutionInstance["state"] } }>(
      `/instance/connectionState/${instanceName}`
    );
    return res.instance.state;
  } catch {
    return null; // instance doesn't exist yet
  }
}

export async function registerWebhook(instanceName: string, webhookUrl: string): Promise<void> {
  // Body must be nested under "webhook" -- confirmed live (a flat body
  // 400s with "instance requires property \"webhook\"", the docs site
  // shows it flat but that's stale for this version, same as `integration`
  // being undocumented-but-required on instance/create).
  await request(`/webhook/set/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        // MESSAGES_UPSERT covers both new incoming and outgoing messages
        // (filtered by fromMe in the adapter's parseInboundMessage) --
        // the one event type this integration actually needs.
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
}

/** Confirmed live: an inbound imageMessage's own `url` is an encrypted
 * Baileys WhatsApp CDN link (mediaKey/fileEncSha256 alongside it) — not
 * fetchable directly, and enabling the webhook's own base64 option
 * does NOT embed decrypted bytes in the webhook payload either
 * (checked live). The actual documented path is this dedicated
 * endpoint: hand back the message's own key.id, Evolution API decrypts
 * server-side and returns the raw bytes as base64. Returns a data: URI
 * (not a remote URL) for the same reason whatsapp.ts's
 * resolveWhatsAppMediaAsDataUri does — the caller (VisionService) never
 * has to know this channel needed anything special. */
export async function getBase64FromMediaMessage(instanceName: string, messageId: string): Promise<string | null> {
  try {
    const result = await request<{ base64?: string; mimetype?: string }>(
      `/chat/getBase64FromMediaMessage/${instanceName}`,
      {
        method: "POST",
        body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
      }
    );
    if (!result.base64) return null;
    return `data:${result.mimetype ?? "image/jpeg"};base64,${result.base64}`;
  } catch {
    return null;
  }
}

async function sendPresence(instanceName: string, number: string, delayMs: number): Promise<void> {
  await request(`/chat/sendPresence/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ number, presence: "composing", delay: delayMs }),
  }).catch(() => {}); // a missed "typing…" indicator must never block the actual reply
}

export async function sendTextMessage(instanceName: string, number: string, text: string): Promise<void> {
  await request(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ number, text }),
  });
}

// Roughly 45 WPM (~230ms/word) as the CENTER of a random range, not a
// fixed value — a flat words*230 formula is itself a detectable bot
// signature (real human typing speed varies message to message, and
// within one message). ±35% jitter per word plus an occasional longer
// "thinking" pause (mid-sentence hesitation, not just at the start)
// keeps the total both irregular and still bounded/reasonable.
const MS_PER_WORD_BASE = 230;
const WORD_JITTER = 0.35;
const MIN_DELAY_MS = 900;
const MAX_DELAY_MS = 7500;
const THINKING_PAUSE_CHANCE = 0.2;
const THINKING_PAUSE_RANGE: [number, number] = [400, 1300];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function typingDelayFor(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  let total = 0;
  for (let i = 0; i < words; i++) {
    total += randomBetween(MS_PER_WORD_BASE * (1 - WORD_JITTER), MS_PER_WORD_BASE * (1 + WORD_JITTER));
  }
  if (Math.random() < THINKING_PAUSE_CHANCE) {
    total += randomBetween(...THINKING_PAUSE_RANGE);
  }
  return Math.round(Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, total)));
}

// Splits on blank lines first (the AI's own paragraph breaks are the
// most natural seams); a single long paragraph with no breaks falls
// back to sentence boundaries. Capped at 3 bubbles — enough to read as
// a person typing multiple thoughts, not so many it reads as spam
// flooding (a different bot-detection trigger than the one this is
// meant to avoid).
const MAX_CHUNKS = 3;

function splitIntoMessages(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const parts = paragraphs.length > 1 ? paragraphs : text.split(/(?<=[.!?])\s+(?=[A-Zঀ-৿])/).map((p) => p.trim()).filter(Boolean);

  if (parts.length <= 1) return [text.trim()];
  if (parts.length <= MAX_CHUNKS) return parts;

  // More natural breaks than the cap allows -- merge down to MAX_CHUNKS
  // evenly rather than dropping content past the limit.
  const merged: string[] = [];
  const perChunk = Math.ceil(parts.length / MAX_CHUNKS);
  for (let i = 0; i < parts.length; i += perChunk) {
    merged.push(parts.slice(i, i + perChunk).join(" "));
  }
  return merged;
}

/** Sends a reply as a human would type it -- a realistic "typing…"
 * pause before each message, and a long answer broken into a few
 * natural bubbles instead of one instant-pasted wall of text. Owner's
 * explicit call: an unofficial Baileys connection (this channel, see
 * this file's own header comment on "real ban risk") is exactly the
 * kind of automation WhatsApp's own anti-bot heuristics watch for --
 * instant, unbroken replies are a real flagged pattern. The official
 * Meta Cloud API integration (whatsapp.ts) is a sanctioned bot channel
 * by design and doesn't use this. */
export async function sendHumanPacedMessage(instanceName: string, number: string, text: string): Promise<void> {
  const parts = splitIntoMessages(text);

  for (const part of parts) {
    const delay = typingDelayFor(part);
    await sendPresence(instanceName, number, delay);
    await new Promise((resolve) => setTimeout(resolve, delay));
    await sendTextMessage(instanceName, number, part);
  }
}
