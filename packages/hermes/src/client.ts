// Hermes agent gateway client (Wave 3).
//
// Talks to a local `hermes gateway run` instance over its OpenAI-compatible
// API server (default: http://127.0.0.1:8642). Tenants are multiplexed under
// /p/<profile-slug>/ and authenticated with the per-profile API key stored in
// that profile's .env under HERMES_HOME/profiles/<slug>/.env — never in
// Postgres. The DEFAULT profile (no /p/ prefix) is the platform/mother agent
// and authenticates with HERMES_HOME/.env's API_SERVER_KEY.
//
// Memory: pass a stable `sessionKey` on every request in a conversation
// (X-Hermes-Session-Key). Hermes resumes that conversation's transcript and
// its persistent memories on later calls, surviving gateway restarts.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8642;
// The Nous Portal account runs on the free tier, which has $0 credits: every
// paid model (including the account's own recommended default) answers with
// "insufficient_credits_for_paid_model". The `:free` models are the only ones
// that actually work, so that is the platform-wide default.
const DEFAULT_MODEL = "upstage/solar-pro4:free";
// The gateway IGNORES the requested model unless the request names a provider --
// without it, it silently uses the account default and the free model is never
// honored. Always send one.
const DEFAULT_PROVIDER = "nous";

// Repo root from this file's position: packages/hermes/src -> <repo>.
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export interface HermesProfileKeyInput {
  /** Hermes profile slug under HERMES_HOME/profiles/<slug>; "default" or undefined = platform agent. */
  tenant?: string;
}

export interface HermesChatArgs extends HermesProfileKeyInput {
  /** The user/visitor message. */
  message: string;
  /** Optional system-prompt override (Hermes SOUL.md is the default personality). */
  systemPrompt?: string;
  /** Stable conversation key. Reuse per conversation to keep memory/session continuity. */
  sessionKey: string;
  /** Model id to request. Defaults to the free Nous model. */
  model?: string;
  /** Optional prior turns to seed context (OpenAI messages shape). */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** A photo attached to this turn. Sent as a native OpenAI ``image_url``
   * content part so a vision-capable model can actually see it; the gateway
   * accepts http(s) and data:image/... URLs. */
  imageUrl?: string;
  /** Explicit API key override (tests/tools). Normally resolved from the profile .env. */
  apiKey?: string;
  /** HTTP timeout for the gateway call. Defaults to 90s. */
  timeoutMs?: number;
}

export interface HermesChatResult {
  answer: string;
  sessionId: string;
  provider: "hermes";
  tokens: number;
  model: string;
}

export class HermesError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly providerMessage: string
  ) {
    super(message);
    this.name = "HermesError";
  }
}

/** Resolve HERMES_HOME: env override, else <repo>/data/hermes. */
export function hermesHome(): string {
  return process.env.HERMES_HOME || path.join(REPO_ROOT, "data", "hermes");
}

function profileEnvPath(tenantFilter: string): string {
  const home = hermesHome();
  if (tenantFilter && tenantFilter !== "default") {
    return path.join(home, "profiles", tenantFilter, ".env");
  }
  return path.join(home, ".env");
}

/**
 * Read API_SERVER_KEY from a Hermes profile's .env. Returns null when the
 * profile (or its key) is not provisioned yet.
 */
export async function readProfileApiKey(tenantFilter?: string): Promise<string | null> {
  const envPath = profileEnvPath(tenantFilter && tenantFilter !== "default" ? tenantFilter : "");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    const match = raw.match(/^API_SERVER_KEY\s*=\s*(.+)$/m);
    return match ? match[1]!.trim() : null;
  } catch {
    return null;
  }
}

export interface HermesProfileEnv {
  apiKey?: string;
  /** Admin-set model override (AIVA_MODEL). Absent = gateway default. */
  aivaModel?: string;
  /** Admin-set provider override (AIVA_PROVIDER). Absent = gateway default. */
  aivaProvider?: string;
}

/**
 * Read the full .env of a Hermes profile (AIVA_MODEL/AIVA_PROVIDER
 * overrides + API_SERVER_KEY). Missing profile → all fields absent.
 */
export async function readProfileEnv(tenantFilter?: string): Promise<HermesProfileEnv> {
  const envPath = profileEnvPath(tenantFilter && tenantFilter !== "default" ? tenantFilter : "");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    const val = (key: string): string | undefined => {
      const m = raw.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"));
      const v = m ? m[1]!.trim() : undefined;
      return v ? v : undefined;
    };
    return { apiKey: val("API_SERVER_KEY"), aivaModel: val("AIVA_MODEL"), aivaProvider: val("AIVA_PROVIDER") };
  } catch {
    return {};
  }
}

function baseUrl(): string {
  const host = process.env.HERMES_HOST || DEFAULT_HOST;
  const port = process.env.HERMES_PORT || String(DEFAULT_PORT);
  return `http://${host}:${port}`;
}

function endpointFor(tenant?: string): string {
  const base = baseUrl();
  if (tenant && tenant !== "default") {
    return `${base}/p/${encodeURIComponent(tenant)}/v1/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

/**
 * The gateway's chat-completions URL for a tenant (no `/p/` prefix = the
 * platform/default agent). Exposed for callers that need to talk to the
 * gateway directly (e.g. probes that must not trigger hermesChat's
 * degraded-override fallback).
 */
export function hermesApiUrl(tenant?: string): string {
  return endpointFor(tenant);
}

interface HermesCompletionResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { role?: string; content?: string | null } }>;
  usage?: { total_tokens?: number };
}

/**
 * Send one chat completion to the Hermes gateway. Resolves the tenant's API
 * key from the profile .env; throws HermesError(401) when the profile key is
 * missing/fail-closed.
 */
export async function hermesChat(args: HermesChatArgs): Promise<HermesChatResult> {
  const env = args.apiKey ? {} : await readProfileEnv(args.tenant);
  const apiKey = args.apiKey ?? env.apiKey ?? null;
  if (!apiKey) {
    throw new HermesError(
      `Hermes profile '${args.tenant || "default"}' is not provisioned (missing API_SERVER_KEY).`,
      401,
      "Hermes profile not provisioned"
    );
  }

  const messages: Array<{ role: string; content: unknown }> = [
    ...(args.systemPrompt ? [{ role: "system", content: args.systemPrompt }] : []),
    ...(args.history ?? []),
    args.imageUrl
      ? {
          role: "user",
          content: [
            { type: "text", text: args.message },
            { type: "image_url", image_url: { url: args.imageUrl } },
          ],
        }
      : { role: "user", content: args.message },
  ];

  // Admin-set model/provider override (AIVA_MODEL/AIVA_PROVIDER in the
  // profile's .env) wins over the caller default; explicit `args.model`
  // wins over everything. The gateway honors per-request model/provider.
  const modelOverride = args.model ?? env.aivaModel;
  const effectiveModel = modelOverride ?? DEFAULT_MODEL;
  const effectiveProvider = env.aivaProvider ?? DEFAULT_PROVIDER;
  const overrideInPlay = Boolean(modelOverride || env.aivaProvider);

  const post = (body: { model: string; provider?: string }): Promise<Response> =>
    fetch(endpointFor(args.tenant), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Hermes-Session-Key": args.sessionKey,
      },
      body: JSON.stringify({ ...body, messages, stream: false }),
      signal: AbortSignal.timeout(args.timeoutMs ?? 90_000),
    });

  // A bad admin-set override (unknown model/provider, or a gateway that
  // resolves it to a warning completion instead of an answer) must not
  // wedge a customer conversation — fall back to the gateway's safe
  // default once. The gateway sometimes returns 200 with the error as the
  // answer text, so a degraded-looking answer counts as "failed" too.
  // "requires available credits" is the free-tier answer when someone pins a
  // PAID model, which the free default also fixes.
  const isDegraded = (answer: string, res: Response): boolean =>
    !res.ok ||
    /^⚠️|Provider authentication failed|Unknown provider|Unknown model|Billing or credits exhausted|requires available credits/i.test(
      answer
    );

  let res = await post({
    model: effectiveModel,
    ...(effectiveProvider ? { provider: effectiveProvider } : {}),
  });
  let answer = "";
  let data: HermesCompletionResponse | null = null;
  if (res.ok) data = (await res.json().catch(() => null)) as HermesCompletionResponse | null;
  answer = data?.choices?.[0]?.message?.content ?? "";

  if (overrideInPlay && isDegraded(answer, res)) {
    res = await post({ model: DEFAULT_MODEL, provider: DEFAULT_PROVIDER });
    data = res.ok ? ((await res.json().catch(() => null)) as HermesCompletionResponse | null) : null;
    answer = data?.choices?.[0]?.message?.content ?? "";
  }

  if (res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => "");
    throw new HermesError(
      `Hermes gateway rejected credentials for '${args.tenant || "default"}' (${res.status}). Key mismatch from the profile .env? ${text}`,
      res.status,
      "Hermes authentication failed"
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HermesError(
      `Hermes gateway request failed (${res.status}): ${text}`,
      res.status,
      `Hermes request failed (${res.status})`
    );
  }

  return {
    answer,
    sessionId: data?.id ?? args.sessionKey,
    provider: "hermes",
    tokens: data?.usage?.total_tokens ?? 0,
    model: data?.model ?? effectiveModel,
  };
}

// ── Local fallback brain (llama.cpp on this same VPS) ─────────────────
// The gateway's own agent prompt is ~14.6K tokens (SOUL + tools + skills +
// memory), and this CPU prefills at 12-18 tok/s — minutes per turn. So the
// local model is NOT driven through the gateway: when the cloud brain is
// down we call it RAW with a ~90-token prompt (~4s round trip). It is a
// 0.6B model with no tools, no memory and no vision — last-resort replies
// only, never the primary path.
export interface LocalBrainArgs {
  /** Short persona/instruction line. Keep it small: every token costs a
   *  customer-visible second on a 4-vCPU box. */
  system: string;
  /** Prior turns; only the last few are sent. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LocalBrainResult {
  answer: string;
  tokens: number;
}

/** Env read per call (not at import) so tests can point it elsewhere. */
export function localBrainEndpoint(): { url: string; model: string; apiKey: string | null } {
  return {
    url: process.env.LOCAL_BRAIN_URL ?? "http://127.0.0.1:8080",
    model: process.env.LOCAL_BRAIN_MODEL ?? "qwen3-0.6b-instruct",
    apiKey: process.env.LOCAL_BRAIN_API_KEY ?? null,
  };
}

/**
 * One raw chat completion against the local llama.cpp server. Resolves null
 * on ANY problem (server down, non-2xx, empty answer, timeout) — the caller
 * still has its own canned last resort, so this must never throw.
 */
export async function localBrainChat(args: LocalBrainArgs): Promise<LocalBrainResult | null> {
  const { url, model, apiKey } = localBrainEndpoint();
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: args.system },
          ...(args.history ?? []).slice(-4),
          { role: "user", content: args.message },
        ],
        max_tokens: args.maxTokens ?? 200,
        temperature: 0.4,
        stream: false,
      }),
      signal: AbortSignal.timeout(args.timeoutMs ?? 45_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as HermesCompletionResponse;
    const answer = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!answer) return null;
    return { answer, tokens: data.usage?.total_tokens ?? 0 };
  } catch {
    return null;
  }
}

export interface HermesModelsResult {
  models: string[];
}

/** List models served by a profile (the profile's own id when multiplexed). */
export async function hermesModels(tenant?: string): Promise<HermesModelsResult> {
  const apiKey = await readProfileApiKey(tenant);
  if (!apiKey) {
    return { models: [] };
  }
  const base = baseUrl();
  const url = tenant && tenant !== "default"
    ? `${base}/p/${encodeURIComponent(tenant)}/v1/models`
    : `${base}/v1/models`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    return { models: [] };
  }
  const data = (await res.json()) as { data?: Array<{ id: string }> };
  return { models: (data.data ?? []).map((m) => m.id) };
}