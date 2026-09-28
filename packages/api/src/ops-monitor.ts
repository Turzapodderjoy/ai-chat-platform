// Ops monitor (Control Plane — the "IT guy").
//
// Watches the platform's own infra (gateway, Postgres, tunnel, cache sprawl,
// disk, memory) and acts like a sysadmin: safe restarts are done
// automatically; anything destructive/dangerous is queued as an approval
// request that the admin must confirm with their password (sudo gate). Every
// event is appended to a plain JSONL ledger (data/ops/ops.jsonl) — a durable,
// human-readable open-source log. The IT-guy Hermes agent reads the ledger
// through the control room and can propose approvals the same way.

import { spawn } from "node:child_process";
import os from "node:os";
import { openSync, closeSync } from "node:fs";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import { prisma } from "@ai-chat-platform/database";
import { hermesHome } from "@ai-chat-platform/hermes";

import { probeTcp, dirSize } from "./system-map";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const HERMES_HOME = hermesHome();
const PROFILES_DIR = path.join(HERMES_HOME, "profiles");
const OPS_DIR = path.join(REPO_ROOT, "data", "ops");
const OPS_LOG = path.join(OPS_DIR, "ops.jsonl");
const SYSTEM_DIR = path.join(REPO_ROOT, "data", "system");
const TUNNEL_URL_FILE = path.join(SYSTEM_DIR, "tunnel-url");
const PGDATA = path.join(REPO_ROOT, "..", "local-postgres", "pgdata");
const PG_LOG = path.join(REPO_ROOT, "..", "local-postgres", "pg.log");
const TUNNEL_BIN = "/tmp/opencode/cloudflared";
const TUNNEL_LOG = "/tmp/opencode/cloudflared.log";
const CACHE_DIRS = ["cache", "image_cache", "audio_cache"];
const GATEWAY_PORT = Number(process.env.HERMES_PORT || 8642);
const WEB_PORT = 3000;
const PG_PORT = 5432;

const HEARTBEAT_MS = 60_000;
const REFIX_MIN_MS = 5 * 60_000;

export interface CheckResult {
  component: string;
  label: string;
  status: "ok" | "warning" | "down";
  latency?: number;
  message: string;
  autoFixed?: boolean;
}

export interface OpsEvent {
  id: string;
  ts: string;
  type: "info" | "fix" | "warning" | "approval_request" | "approval_result";
  component: string;
  message: string;
  detail?: string;
  kind?: string;
  params?: Record<string, unknown>;
  source?: string;
  status?: "pending" | "approved" | "canceled";
  approved?: boolean;
  resolvedTs?: string;
  resolvedBy?: string;
  result?: string;
}

export interface OpsSnapshot {
  now: string;
  checks: CheckResult[];
  pending: OpsEvent[];
  activities: OpsEvent[];
  os: { freeMem: number; totalMem: number; diskUsedPercent: number | null } | null;
}

const DANGEROUS: Record<string, { label: string; params: string }> = {
  "clear-profile-cache": { label: "Clear agent cache (images/audio/embeddings)", params: "slug: profile slug or \"all\"" },
  "flush-gateway-sessions": { label: "Reset gateway sessions (forces clients to re-authenticate)", params: "" },
  "revert-override": { label: "Reset an agent's AI override back to gateway default", params: "slug: profile slug" },
  "vacuum-db": { label: "Vacuum FULL the database (brief heavy lock)", params: "" },
};

const SAFE: Record<string, { label: string; params: string }> = {
  "restart-gateway": { label: "Restart the Hermes gateway", params: "" },
  "restart-postgres": { label: "Restart local Postgres", params: "" },
  "restart-tunnel": { label: "Restart the Cloudflare tunnel (new URL)", params: "" },
};

interface ExecutorOptions {
  hermesAdmin: { update: (slug: string, opts: { provider?: string; model?: string }) => Promise<unknown> };
}

function spawnDetached(cmd: string, args: string[], cwd: string, outFile: string): void {
  const out = openSync(outFile, "a");
  const child = spawn(cmd, args, {
    cwd,
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  closeSync(out);
}

async function writeTunnelUrlAfterStart(): Promise<void> {
  await new Promise((r) => setTimeout(r, 5000));
  try {
    const url = await latestTunnelUrlFromLog();
    if (url) {
      await fs.mkdir(SYSTEM_DIR, { recursive: true });
      await fs.writeFile(TUNNEL_URL_FILE, url);
    }
  } catch {
    /* binary/log missing — leave URL unchanged */
  }
}

/** Newest tunnel URL in the (append-only) cloudflared log. cloudflared logs
 *  each instance's assigned URL as it starts, so the LAST occurrence is the
 *  most recently started tunnel. */
async function latestTunnelUrlFromLog(): Promise<string> {
  try {
    const raw = await fs.readFile(TUNNEL_LOG, "utf8");
    const urls = raw.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g) ?? [];
    return urls[urls.length - 1] ?? "";
  } catch {
    return "";
  }
}

/** How many cloudflared instances are alive (Linux /proc scan). Prevents the
 *  monitor from piling up tunnel processes on a blip — if one is already
 *  running, we re-track its URL instead of spawning another. */
async function countTunnelProcesses(): Promise<number> {
  try {
    const procs = await fs.readdir("/proc");
    let n = 0;
    for (const pid of procs) {
      if (!/^\d+$/.test(pid)) continue;
      const cmd = await fs.readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "");
      if (cmd.includes("cloudflared")) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

async function profileCacheBytes(): Promise<{ slug: string; bytes: number }[]> {
  const entries = (await fs.readdir(PROFILES_DIR, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory() && !e.name.startsWith("."));
  const out: { slug: string; bytes: number }[] = [];
  for (const e of entries) {
    const base = path.join(PROFILES_DIR, e.name);
    const cached = await Promise.all(
      CACHE_DIRS.map((d) => dirSize(path.join(base, d)).then((b) => b)),
    );
    const cacheBytes = cached.reduce((a, b) => a + b, 0);
    if (cacheBytes > 0) out.push({ slug: e.name, bytes: cacheBytes });
  }
  return out;
}

export class OpsMonitorController {
  private readonly lastFix: Map<string, number> = new Map();
  private readonly lastWarned: Map<string, string> = new Map();

  constructor(private readonly deps: ExecutorOptions) {
    const g = globalThis as Record<string, unknown>;
    if (g["aiva-ops-heartbeat"]) return;
    const id = setInterval(() => {
      this.status().catch(() => undefined);
    }, HEARTBEAT_MS);
    if (typeof (id as { unref?: () => void }).unref === "function") (id as { unref: () => void }).unref();
    g["aiva-ops-heartbeat"] = id;
    // First beat immediately so issues are caught without waiting a minute.
    this.status().catch(() => undefined);
    void prisma;
    void existsSync;
  }

  async status(): Promise<OpsSnapshot> {
    const checks = await this.runChecks();
    const pending = (await this.readLedger(200)).filter((e) => e.type === "approval_request" && e.status === "pending");
    const activities = (await this.readLedger(30)).filter((e) => e.type !== "approval_request" || e.status !== "pending");
    let osInfo: OpsSnapshot["os"] = null;
    try {
      const { statfs } = await import("node:fs/promises");
      const s = (await statfs("/")) as { blocks: number; bfree: number };
      osInfo = {
        freeMem: os.freemem(),
        totalMem: os.totalmem(),
        diskUsedPercent: s.blocks ? Math.round(((s.blocks - s.bfree) / s.blocks) * 100) : null,
      };
    } catch {
      osInfo = null;
    }
    return { now: new Date().toISOString(), checks, pending, activities, os: osInfo };
  }

  private async runChecks(): Promise<CheckResult[]> {
    const checks: CheckResult[] = [];
    const [gw, pg, web] = await Promise.all([probeTcp(GATEWAY_PORT), probeTcp(PG_PORT), probeTcp(WEB_PORT)]);

    const gwCheck: CheckResult = { component: "gateway", label: "Hermes gateway", status: gw.ok ? "ok" : "down", latency: gw.ok ? gw.ms : undefined, message: gw.ok ? "accepting connections" : "NOT responding" };
    if (!gw.ok) {
      if (this.canRefix("gateway")) {
        try {
          spawnDetached(process.execPath, ["scripts/hermes/serve-dev.mjs"], REPO_ROOT, path.join(HERMES_HOME, "logs", "gateway-controller.log"));
          this.logEvent("fix", "gateway", `Gateway was down (port ${GATEWAY_PORT}) — restart attempted.`, { kind: "restart-gateway" });
          this.markRefixed("gateway");
          gwCheck.status = "warning";
          gwCheck.message = "was down — restart command issued";
          gwCheck.autoFixed = true;
        } catch {
          /* spawn failure logged below */
        }
      } else {
        gwCheck.message = "down — restart throttled (recent attempt)";
      }
    }
    checks.push(gwCheck);

    const pgCheck: CheckResult = { component: "postgres", label: "PostgreSQL", status: pg.ok ? "ok" : "down", latency: pg.ok ? pg.ms : undefined, message: pg.ok ? "responding" : "NOT responding on 5432" };
    if (!pg.ok) {
      if (this.canRefix("postgres")) {
        try {
          spawnDetached("/usr/bin/pg_ctl", ["-D", PGDATA, "-l", PG_LOG, "-o", "-p 5432 -k /tmp", "start"], REPO_ROOT, path.join(HERMES_HOME, "logs", "gateway-controller.log"));
          this.logEvent("fix", "postgres", "Postgres was down — start command issued (pg_ctl).", { kind: "restart-postgres" });
          this.markRefixed("postgres");
          pgCheck.status = "warning";
          pgCheck.message = "was down — start command issued";
          pgCheck.autoFixed = true;
        } catch {
          /* ignore */
        }
      } else {
        pgCheck.message = "down — start throttled (recent attempt)";
      }
    }
    checks.push(pgCheck);

    const webCheck: CheckResult = { component: "web", label: "AIVA app", status: web.ok ? "ok" : "down", latency: web.ok ? web.ms : undefined, message: web.ok ? "serving" : "this process is down (cannot self-restart)" };
    checks.push(webCheck);

    // Cloudflare tunnel
    let tunnelUrl = "";
    try {
      tunnelUrl = (await fs.readFile(TUNNEL_URL_FILE, "utf8")).trim();
      if (!tunnelUrl) tunnelUrl = await latestTunnelUrlFromLog();
    } catch {
      tunnelUrl = "";
    }
    let tunnelUp = false;
    if (tunnelUrl) {
      try {
        const res = await Promise.race([
          fetch(`${tunnelUrl}/api/health`, { signal: AbortSignal.timeout(4000) }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("tunnel timeout")), 5000)),
        ]);
        tunnelUp = res.ok;
      } catch {
        tunnelUp = false;
      }
    }
    const tunnelProcs = await countTunnelProcesses();
    const tunnelCheck: CheckResult = {
      component: "tunnel",
      label: "Cloudflare tunnel",
      status: tunnelUp ? "ok" : tunnelUrl ? (tunnelProcs > 0 ? "warning" : "down") : "warning",
      message: tunnelUp
        ? tunnelUrl
        : tunnelUrl
          ? `${tunnelUrl} unreachable · ${tunnelProcs} tunnel process(es) running`
          : tunnelProcs > 0
            ? `running (${tunnelProcs} process(es)) — URL not recorded yet`
            : "not running",
    };
    if (!tunnelUp) {
      if (tunnelProcs === 0 && existsSync(TUNNEL_BIN)) {
        if (this.canRefix("tunnel")) {
          try {
            spawnDetached(TUNNEL_BIN, ["tunnel", "--no-autoupdate", "--url", "http://localhost:3000"], "/tmp", TUNNEL_LOG);
            void writeTunnelUrlAfterStart();
            this.logEvent("fix", "tunnel", "No tunnel process was running — restart command issued (a new URL will appear).", { kind: "restart-tunnel" });
            this.markRefixed("tunnel");
            tunnelCheck.status = "warning";
            tunnelCheck.message = "not running — restart command issued";
            tunnelCheck.autoFixed = true;
          } catch {
            /* spawn failed */
          }
        } else {
          tunnelCheck.message += " — restart throttled (recent attempt)";
        }
      } else if (tunnelProcs > 0) {
        // A tunnel process is alive but the saved URL is unresponsive — the
        // instance may have been re-assigned a new URL; retrack the newest
        // one and re-probe it instead of spawning (avoids process pile-up).
        const latest = await latestTunnelUrlFromLog();
        if (latest && latest !== tunnelUrl) {
          await fs.mkdir(SYSTEM_DIR, { recursive: true });
          await fs.writeFile(TUNNEL_URL_FILE, latest);
          try {
            const res = await Promise.race([
              fetch(`${latest}/api/health`, { signal: AbortSignal.timeout(4000) }),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("tunnel timeout")), 5000)),
            ]);
            tunnelUp = res.ok;
          } catch {
            tunnelUp = false;
          }
          tunnelCheck.status = tunnelUp ? "ok" : "warning";
          tunnelCheck.message = tunnelUp ? latest : `${latest} unreachable`;
          if (tunnelUp) this.lastWarned.delete("tunnel");
        }
      } else {
        tunnelCheck.message = "down — cloudflared binary not found";
      }
    }
    checks.push(tunnelCheck);

    // Disk + memory warnings (no auto-fix — human decision).
    try {
      const { statfs } = await import("node:fs/promises");
      const s = (await statfs("/")) as { blocks: number; bfree: number };
      const usedPct = s.blocks ? Math.round(((s.blocks - s.bfree) / s.blocks) * 100) : -1;
      if (usedPct > 85) {
        checks.push({ component: "disk", label: "Disk", status: "warning", message: `${usedPct}% used` });
        this.logIfChanged("disk", `Disk usage ${usedPct}% (>85%) — consider freeing space.`);
      } else {
        this.lastWarned.delete("disk");
      }
    } catch {
      /* non-Linux */
    }
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memPct = totalMem ? Math.round((freeMem / totalMem) * 100) : -1;
    if (memPct >= 0 && memPct < 10) {
      checks.push({ component: "mem", label: "Memory", status: "warning", message: `${memPct}% free` });
      this.logIfChanged("mem", `System memory at ${memPct}% free — consider stopping unused services.`);
    } else {
      this.lastWarned.delete("mem");
    }

    // Cache sprawl — propose a clean-up approval (only once; Idempotent).
    try {
      const caches = await profileCacheBytes();
      const total = caches.reduce((a, c) => a + c.bytes, 0);
      if (total > 200 * 1024 * 1024) {
        const biggest = caches.sort((a, b) => b.bytes - a.bytes)[0]!;
        checks.push({ component: "cache", label: "Agent caches", status: "warning", message: `${(total / 1e6).toFixed(0)}MB across profiles (largest: ${biggest.slug} ${(biggest.bytes / 1e6).toFixed(0)}MB)` });
        const existing = (await this.readLedger(200)).find(
          (e) => e.type === "approval_request" && e.kind === "clear-profile-cache" && e.status === "pending",
        );
        if (!existing) {
          await this.propose("clear-profile-cache", { slug: "all" }, `Agent caches total ${(total / 1e6).toFixed(0)}MB across ${caches.length} profile(s).`, "ops-monitor");
        }
      }
    } catch {
      /* profiles dir unavailable */
    }

    return checks;
  }

  private canRefix(component: string): boolean {
    const last = this.lastFix.get(component) ?? 0;
    return Date.now() - last > REFIX_MIN_MS;
  }
  private markRefixed(component: string): void {
    this.lastFix.set(component, Date.now());
  }

  private async logIfChanged(component: string, message: string): Promise<void> {
    if (this.lastWarned.get(component) === message) return;
    this.lastWarned.set(component, message);
    await this.logEvent("warning", component, message);
  }

  private async logEvent(type: OpsEvent["type"], component: string, message: string, extra: Partial<OpsEvent> = {}): Promise<OpsEvent> {
    const event: OpsEvent = {
      id: randomBytes(6).toString("hex"),
      ts: new Date().toISOString(),
      type,
      component,
      message,
      ...extra,
    };
    await fs.mkdir(OPS_DIR, { recursive: true });
    await fs.appendFile(OPS_LOG, JSON.stringify(event) + "\n", "utf8");
    return event;
  }

  async readLedger(limit = 40): Promise<OpsEvent[]> {
    try {
      const raw = await fs.readFile(OPS_LOG, "utf8");
      const lines = raw.split("\n").filter(Boolean);
      return lines.slice(-Math.max(limit, 1)).reverse().map((l) => {
        try {
          return JSON.parse(l) as OpsEvent;
        } catch {
          return null;
        }
      }).filter((e): e is OpsEvent => e !== null);
    } catch {
      return [];
    }
  }

  async textForAgent(): Promise<string> {
    const snap = await this.status();
    const lines = snap.checks.map((c) => `- ${c.label}: ${c.status.toUpperCase()} — ${c.message}`);
    const pend = snap.pending.map((p) => `- ${p.id} [${p.kind}] ${p.message}`);
    const recent = snap.activities.slice(0, 12).map((a) => `- [${a.ts.slice(11, 19)}] ${a.type} · ${a.component}: ${a.message}`);
    return [
      "== Current system status ==",
      "Checks:",
      ...lines,
      `Pending approvals: ${pend.length}`,
      ...(pend.length ? pend : ["- none"]),
      "Recent ops:",
      ...(recent.length ? recent : ["- none yet"]),
    ].join("\n");
  }

  /** Proposal path used by the IT-guy agent and the monitor itself. */
  async propose(kind: string, params: Record<string, unknown>, summary: string, source = "it-guy"): Promise<OpsEvent> {
    const catalog = DANGEROUS[kind] ?? SAFE[kind];
    if (!catalog) throw new Error(`Unknown op '${kind}'. Known: ${Object.keys(DANGEROUS).join(", ")}, ${Object.keys(SAFE).join(", ")}`);
    return this.logEvent("approval_request", kind, summary, {
      kind,
      params: params ?? {},
      source,
      status: "pending",
      detail: catalog.label,
    });
  }

  /** Password-gated execution path. Only reachable after the admin re-authenticates. */
  async approve(id: string, ok: boolean, executedBy: string, note?: string): Promise<OpsEvent> {
    const ev = (await this.readLedger(500)).find((e) => e.id === id && e.type === "approval_request");
    if (!ev || ev.status === "approved" || ev.status === "canceled") throw new Error(`No pending approval '${id}'.`);
    const resolved: OpsEvent = {
      id: randomBytes(6).toString("hex"),
      ts: new Date().toISOString(),
      type: "approval_result",
      component: ev.component,
      message: ok ? `Approved and executed by ${executedBy}${note ? ` — ${note}` : ""}.` : `Denied by ${executedBy}.`,
      detail: ev.detail,
      kind: ev.kind,
      params: ev.params,
      source: ev.source,
      status: ok ? "approved" : "canceled",
      approved: ok,
      resolvedTs: new Date().toISOString(),
      resolvedBy: executedBy,
    };

    // Mark the original + write the result atomically-ish.
    await fs.mkdir(OPS_DIR, { recursive: true });
    const raw = await fs.readFile(OPS_LOG, "utf8").catch(() => "");
    const lines = raw.split("\n").filter(Boolean).map((l) => {
      try {
        const e = JSON.parse(l) as OpsEvent;
        if (e.id === id) {
          e.status = ok ? "approved" : "canceled";
          e.resolvedTs = resolved.ts;
          e.resolvedBy = executedBy;
          e.result = ok ? "approved" : "canceled";
        }
        return JSON.stringify(e);
      } catch {
        return l;
      }
    });
    await fs.writeFile(OPS_LOG, lines.join("\n") + "\n", "utf8");

    if (ok) {
      try {
        const result = await this.execute(ev);
        resolved.result = typeof result === "string" && result ? result : undefined;
        resolved.message += typeof result === "string" && result ? ` Result: ${result}` : "";
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        resolved.message += ` Execution FAILED: ${msg}`;
      }
      await fs.appendFile(OPS_LOG, JSON.stringify(resolved) + "\n", "utf8");
    } else {
      await fs.appendFile(OPS_LOG, JSON.stringify(resolved) + "\n", "utf8");
    }
    return resolved;
  }

  /** Executes an approved op. Never called without a preceding password gate. */
  private async execute(ev: OpsEvent): Promise<string> {
    const params = (ev.params ?? {}) as Record<string, unknown>;
    switch (ev.kind) {
      case "restart-gateway": {
        spawnDetached(process.execPath, ["scripts/hermes/serve-dev.mjs"], REPO_ROOT, path.join(HERMES_HOME, "logs", "gateway-controller.log"));
        return "restart command issued";
      }
      case "restart-postgres": {
        spawnDetached("/usr/bin/pg_ctl", ["-D", PGDATA, "-l", PG_LOG, "-o", "-p 5432 -k /tmp", "restart"], REPO_ROOT, path.join(HERMES_HOME, "logs", "gateway-controller.log"));
        return "restart command issued";
      }
      case "restart-tunnel": {
        if (existsSync(TUNNEL_BIN)) {
          spawnDetached(TUNNEL_BIN, ["tunnel", "--no-autoupdate", "--url", "http://localhost:3000"], "/tmp", TUNNEL_LOG);
          void writeTunnelUrlAfterStart();
          return "restart command issued (new URL will appear)";
        }
        return "cloudflared binary not found";
      }
      case "clear-profile-cache": {
        const slug = typeof params.slug === "string" ? String(params.slug) : "all";
        const entries = slug === "all"
          ? (await fs.readdir(PROFILES_DIR, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name)
          : [validateSlug(slug)];
        let cleared = 0;
        for (const s of entries) {
          for (const d of CACHE_DIRS) {
            const dir = path.join(PROFILES_DIR, s, d);
            await fs.rm(dir, { recursive: true, force: true });
            await fs.mkdir(dir, { recursive: true });
            cleared++;
          }
        }
        return `cleared ${cleared} cache dir(s) across ${entries.length} profile(s)`;
      }
      case "flush-gateway-sessions": {
        let cleared = 0;
        const targets = [path.join(HERMES_HOME, "sessions"), ...(await fs.readdir(PROFILES_DIR, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => path.join(PROFILES_DIR, e.name, "sessions"))];
        for (const dir of targets) {
          const inner = await fs.readdir(dir).catch(() => [] as string[]);
          for (const name of inner) {
            await fs.rm(path.join(dir, name), { recursive: true, force: true });
            cleared++;
          }
        }
        return `cleared ${cleared} session file(s)`;
      }
      case "revert-override": {
        const slug = validateSlug(String(params.slug ?? ""));
        await this.deps.hermesAdmin.update(slug, { provider: "", model: "" });
        return `'${slug}' override reset to gateway default`;
      }
      case "vacuum-db": {
        await prisma.$executeRawUnsafe("VACUUM FULL");
        return "VACUUM FULL completed";
      }
      default:
        throw new Error(`No executor for '${ev.kind}'.`);
    }
  }
}

function validateSlug(slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new Error(`Invalid slug '${slug}'.`);
  return slug;
}