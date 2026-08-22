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

export async function sendTextMessage(instanceName: string, number: string, text: string): Promise<void> {
  await request(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ number, text }),
  });
}
