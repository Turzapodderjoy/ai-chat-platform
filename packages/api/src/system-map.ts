// System map (Control Plane). One snapshot of the whole platform wired
// together — the process topology (Next app, Hermes gateway, Postgres,
// tunnel, channels, agent profiles, provider) with live health probes, plus
// the storage picture (DB tables/sizes, profile dirs, logs, secret presence).
// The dashboard's System Map panel draws this as an n8n-style box-and-line
// graph and re-fetches it every few seconds.

import net from "node:net";
import os from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prisma } from "@ai-chat-platform/database";
import { hermesHome, readProfileEnv } from "@ai-chat-platform/hermes";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const HERMES_HOME = hermesHome();
const PROFILES_DIR = path.join(HERMES_HOME, "profiles");
const OPS_LOG = path.join(REPO_ROOT, "data", "ops", "ops.jsonl");
const TUNNEL_URL_FILE = path.join(REPO_ROOT, "data", "system", "tunnel-url");

const GATEWAY_PORT = Number(process.env.HERMES_PORT || 8642);
const WEB_PORT = 3000;

export type NodeStatus = "ok" | "degraded" | "down" | "unknown";

export interface MapNode {
  id: string;
  label: string;
  kind: string;
  status: NodeStatus;
  latency?: number;
  detail: string;
}

export interface StorageTable {
  name: string;
  rows: number | null;
  bytes: number | null;
}

export interface StorageInfo {
  dbBytes: number | null;
  tables: StorageTable[];
  profiles: Array<{ slug: string; bytes: number; soulBytes: number; stateDbBytes: number }>;
  logsBytes: Record<string, number>;
  secretPresent: boolean;
}

export interface MapSnapshot {
  generatedAt: string;
  nodes: MapNode[];
  storage: StorageInfo;
  os: { freeMem: number; totalMem: number; diskUsedPercent: number | null } | null;
}

export function probeTcp(port: number, host = "127.0.0.1", timeoutMs = 900): Promise<{ ok: boolean; ms: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = net.createConnection({ host, port });
    const finish = (ok: boolean) => {
      sock.destroy();
      resolve({ ok, ms: Date.now() - start });
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
    sock.once("timeout", () => finish(false));
  });
}

async function probePg(): Promise<{ ok: boolean; ms: number }> {
  const start = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("pg probe timeout")), 3000)),
    ]);
    return { ok: true, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}

async function probeTunnel(): Promise<{ status: NodeStatus; latency?: number; detail: string }> {
  let url = "";
  try {
    url = (await fs.readFile(TUNNEL_URL_FILE, "utf8")).trim();
  } catch {
    // No saved URL — the tunnel may still be up; fall back to probing the
    // known cloudflared log for a URL.
  }
  if (!url) {
    try {
      const raw = await fs.readFile("/tmp/opencode/cloudflared.log", "utf8");
      url = raw.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? "";
    } catch {
      /* ignore */
    }
  }
  if (!url) return { status: "unknown", detail: "tunnel not running (no URL)" };
  const start = Date.now();
  try {
    const res = await Promise.race([
      fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("tunnel probe timeout")), 6000)),
    ]);
    const ok = res.ok;
    return {
      status: ok ? "ok" : "degraded",
      latency: Date.now() - start,
      detail: `${url}${ok ? "" : ` (HTTP ${res.status})`}`,
    };
  } catch {
    return { status: "down", detail: `${url} not reachable` };
  }
}

export async function dirSize(dir: string, ignore = new Set<string>()): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    if (ignore.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      total += await dirSize(full);
    } else if (e.isFile()) {
      const st = await fs.stat(full).catch(() => null);
      total += st?.size ?? 0;
    }
  }
  return total;
}

async function snapProfiles(): Promise<
  Array<{
    slug: string;
    provisioned: boolean;
    model: string | null;
    provider: string | null;
    businesses: Array<{ name: string; enabled: boolean }>;
    status: NodeStatus;
    detail: string;
  }>
> {
  const entries = (await fs.readdir(PROFILES_DIR, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  const biz = await prisma.business.findMany({
    where: { hermesProfile: { in: entries } },
    select: { name: true, hermesProfile: true, hermesEnabled: true, aiEnabled: true },
  });

  const gw = await probeTcp(GATEWAY_PORT);
  const out = [];
  for (const slug of entries) {
    const env = await readProfileEnv(slug);
    const businesses = biz
      .filter((b) => b.hermesProfile === slug)
      .map((b) => ({ name: b.name, enabled: b.hermesEnabled && b.aiEnabled }));
    const ai = env.aivaProvider || env.aivaModel ? `${env.aivaProvider ?? "?"}/${env.aivaModel ?? "gateway default"}` : "gateway default";
    out.push({
      slug,
      provisioned: Boolean(env.apiKey),
      model: env.aivaModel ?? null,
      provider: env.aivaProvider ?? null,
      businesses,
      status: gw.ok && env.apiKey ? ("ok" as NodeStatus) : gw.ok ? ("degraded" as NodeStatus) : ("down" as NodeStatus),
      detail: `AI = ${ai} · ${businesses.length ? businesses.map((b) => b.name).join(", ") : "no business assigned"}${env.apiKey ? "" : " · NOT provisioned"}`,
    });
  }
  return out;
}

async function snapStorage(): Promise<StorageInfo> {
  let dbBytes: number | null = null;
  let tables: StorageTable[] = [];
  try {
    const size = (await prisma.$queryRaw<Array<{ bytes: bigint | number }>>`SELECT pg_database_size(current_database()) AS bytes`)[0]?.bytes ?? null;
    dbBytes = size === null || size === undefined ? null : Number(size);
    const rows = await prisma.$queryRaw<
      Array<{ name: string; rows: bigint | number | null; bytes: bigint | number | null }>
    >`
      SELECT c.relname AS name, c.reltuples::bigint AS rows, pg_total_relation_size(c.oid)::bigint AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
      ORDER BY bytes DESC LIMIT 12`;
    tables = rows.map((r) => ({ name: r.name, rows: r.rows === null ? null : Number(r.rows), bytes: r.bytes === null ? null : Number(r.bytes) }));
  } catch {
    // Postgres down — storage section reports what it can.
  }

  const profiles: StorageInfo["profiles"] = [];
  const entries = (await fs.readdir(PROFILES_DIR, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory() && !e.name.startsWith("."));
  for (const e of entries) {
    const base = path.join(PROFILES_DIR, e.name);
    const [total, soulBytes, stateDbBytes] = await Promise.all([
      dirSize(base, new Set(["audio_cache", "image_cache", "cache"])),
      fs.stat(path.join(base, "SOUL.md")).then((s) => s.size).catch(() => 0),
      fs.stat(path.join(base, "state.db")).then((s) => s.size).catch(() => 0),
    ]);
    profiles.push({ slug: e.name, bytes: total, soulBytes, stateDbBytes });
  }

  const logsBytes: Record<string, number> = {};
  for (const name of ["gateway.log", "errors.log", "agent.log", "gateway-exit-diag.log", "ops.jsonl"]) {
    const target = name === "ops.jsonl" ? OPS_LOG : path.join(HERMES_HOME, "logs", name);
    const st = await fs.stat(target).catch(() => null);
    if (st) logsBytes[name] = st.size;
  }

  let secretPresent = false;
  for (const p of [...entries.map((e) => path.join(PROFILES_DIR, e.name, ".env")), path.join(HERMES_HOME, ".env")]) {
    if ((await fs.stat(p).catch(() => null))?.size) {
      secretPresent = true;
      break;
    }
  }

  return { dbBytes, tables, profiles, logsBytes, secretPresent };
}

export class SystemMapController {
  async snapshot(): Promise<MapSnapshot> {
    const [gw, web, pg, tunnel] = await Promise.all([
      probeTcp(GATEWAY_PORT),
      probeTcp(WEB_PORT),
      probePg(),
      probeTunnel(),
    ]);
    const [profiles, storage] = await Promise.all([snapProfiles(), snapStorage()]);

    const nodes: MapNode[] = [
      { id: "ch-web", label: "Website Widget", kind: "channel", status: "ok", detail: "customer chat widget on client sites" },
      { id: "ch-messenger", label: "Facebook Messenger", kind: "channel", status: "ok", detail: "webhook → /api/webhooks/[channel]" },
      { id: "ch-instagram", label: "Instagram", kind: "channel", status: "ok", detail: "webhook → /api/webhooks/[channel]" },
      { id: "ch-whatsapp", label: "WhatsApp", kind: "channel", status: "ok", detail: "webhook → /api/webhooks/[channel]" },
      { id: "ch-team", label: "Team Chat", kind: "channel", status: "ok", detail: "human staff ↔ handoffs" },
      {
        id: "next-api",
        label: "AIVA App (Next.js)",
        kind: "app",
        status: web.ok ? "ok" : "down",
        latency: web.ok ? web.ms : undefined,
        detail: `API routes · ChatService · Hermes client — :${WEB_PORT}`,
      },
      {
        id: "postgres",
        label: "PostgreSQL",
        kind: "app",
        status: pg.ok ? "ok" : "down",
        latency: pg.ok ? pg.ms : undefined,
        detail: "Conversations, Businesses, Orders, Repairs… → see Storage",
      },
      {
        id: "hermes-gateway",
        label: "Hermes Gateway",
        kind: "app",
        status: gw.ok ? "ok" : "down",
        latency: gw.ok ? gw.ms : undefined,
        detail: `OpenAI-compatible agent runtime — :${GATEWAY_PORT}`,
      },
      {
        id: "agt-platform",
        label: "Hermes Control",
        kind: "agent",
        status: gw.ok ? "ok" : "down",
        detail: "platform 'default' agent — the assigned changer (Control Room + IT Guy)",
      },
      ...profiles.map((p) => ({
        id: `agt-${p.slug}`,
        label: p.slug,
        kind: "agent" as const,
        status: p.status,
        detail: p.detail,
      })),
      {
        id: "prv-ai",
        label: "AI Provider",
        kind: "provider",
        status: gw.ok ? "ok" : "unknown",
        detail: "model/provider resolved by the gateway per agent",
      },
      { id: "tunnel", label: "Cloudflare Tunnel", kind: "net", status: tunnel.status, latency: tunnel.latency, detail: tunnel.detail },
    ];

    let osInfo: MapSnapshot["os"] = null;
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      let diskUsedPercent: number | null = null;
      try {
        const { statfs } = await import("node:fs/promises");
        const s = (await statfs("/")) as { blocks: number; bfree: number };
        diskUsedPercent = s.blocks ? Math.round(((s.blocks - s.bfree) / s.blocks) * 100) : null;
      } catch {
        diskUsedPercent = null;
      }
      osInfo = { freeMem, totalMem, diskUsedPercent };
    } catch {
      osInfo = null;
    }

    return { generatedAt: new Date().toISOString(), nodes, storage, os: osInfo };
  }
}