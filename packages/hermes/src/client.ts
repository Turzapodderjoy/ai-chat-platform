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
const DEFAULT_MODEL = "nous/welcome";

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
  /** Explicit API key override (tests/tools). Normally resolved from the profile .env. */
  apiKey?: string;
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
  const apiKey = args.apiKey ?? (await readProfileApiKey(args.tenant));
  if (!apiKey) {
    throw new HermesError(
      `Hermes profile '${args.tenant || "default"}' is not provisioned (missing API_SERVER_KEY).`,
      401,
      "Hermes profile not provisioned"
    );
  }

  const messages: Array<{ role: string; content: string }> = [
    ...(args.systemPrompt ? [{ role: "system", content: args.systemPrompt }] : []),
    ...(args.history ?? []),
    { role: "user", content: args.message },
  ];

  const res = await fetch(endpointFor(args.tenant), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Hermes-Session-Key": args.sessionKey,
    },
    body: JSON.stringify({
      model: args.model ?? DEFAULT_MODEL,
      messages,
      stream: false,
    }),
    signal: AbortSignal.timeout(90_000),
  });

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

  const data = (await res.json()) as HermesCompletionResponse;
  const answer = data.choices?.[0]?.message?.content ?? "";

  return {
    answer,
    sessionId: data.id ?? args.sessionKey,
    provider: "hermes",
    tokens: data.usage?.total_tokens ?? 0,
    model: data.model ?? args.model ?? DEFAULT_MODEL,
  };
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