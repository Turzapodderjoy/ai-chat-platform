/** Thin REST client for a self-hosted OpenWA gateway (github.com/rmyndharis/OpenWA)
 * — an unofficial WhatsApp bridge used for testing-only, per-client sessions
 * alongside the official Meta WhatsApp Cloud API integration (whatsapp.ts).
 * One OpenWA instance serves every business; each business gets its own
 * OpenWA "session" (one WhatsApp number linked via QR). Base URL + API key
 * are platform-wide config, read from env like every other provider key. */

function baseUrl(): string {
  return process.env.OPENWA_BASE_URL ?? "http://localhost:2785";
}

function apiKey(): string {
  const key = process.env.OPENWA_API_KEY;
  if (!key) throw new Error("OPENWA_API_KEY is not configured.");
  return key;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey(),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error(`OpenWA ${init?.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface OpenWaSession {
  id: string;
  name: string;
  status: "created" | "initializing" | "qr_ready" | "authenticating" | "ready" | "disconnected" | "action_required" | "failed";
  phone: string | null;
}

/** Session names must be alphanumeric + hyphens — businessId (a cuid) already
 * qualifies, just prefix it so it's recognizable in the OpenWA dashboard. */
export function sessionNameForBusiness(businessId: string): string {
  return `biz-${businessId}`;
}

export async function createOrGetSession(businessId: string): Promise<OpenWaSession> {
  const name = sessionNameForBusiness(businessId);

  try {
    return await request<OpenWaSession>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  } catch (err) {
    // 409 = session with this name already exists — fetch it instead.
    if (err instanceof Error && err.message.includes("409")) {
      const sessions = await request<OpenWaSession[]>("/api/sessions");
      const existing = sessions.find((s) => s.name === name);
      if (existing) return existing;
    }
    throw err;
  }
}

export async function startSession(sessionId: string): Promise<void> {
  await request(`/api/sessions/${sessionId}/start`, { method: "POST" });
}

export async function getSession(sessionId: string): Promise<OpenWaSession> {
  return request<OpenWaSession>(`/api/sessions/${sessionId}`);
}

export async function getQrCode(sessionId: string): Promise<string | null> {
  try {
    const res = await request<{ qrCode: string }>(`/api/sessions/${sessionId}/qr`);
    return res.qrCode;
  } catch {
    return null; // not ready yet (already authenticated, or QR not generated)
  }
}

export async function registerWebhook(sessionId: string, webhookUrl: string): Promise<void> {
  const existing = await request<Array<{ url: string }>>(`/api/sessions/${sessionId}/webhooks`);
  if (existing.some((w) => w.url === webhookUrl)) return;

  await request(`/api/sessions/${sessionId}/webhooks`, {
    method: "POST",
    body: JSON.stringify({ url: webhookUrl, events: ["message.received"] }),
  });
}

export async function sendTextMessage(sessionId: string, chatId: string, text: string): Promise<void> {
  await request(`/api/sessions/${sessionId}/messages/send-text`, {
    method: "POST",
    body: JSON.stringify({ chatId, text }),
  });
}
