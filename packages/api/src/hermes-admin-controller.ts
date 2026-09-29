// Hermes agent administration (Platform tab).
//
// Each Hermes agent lives as a directory under HERMES_HOME/profiles/<slug>:
//   - SOUL.md        — the agent's persona / system instruction
//   - .env           — API_SERVER_KEY (per-agent gateway credential) +
//                      AIVA_MODEL / AIVA_PROVIDER (admin-set AI override)
//   - auth.json etc. — Hermes-managed identity (flows etc.)
//
// Creating an agent shells out to `hermes profile create <slug> --clone`
// so the free-tier Nous identity is inherited; deleting one is refused
// while any Business still references it (those chats would otherwise
// route to a dead profile). Reads/writes that filesystem directly — the
// gateway hot-admits new profiles without a restart.

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { prisma } from "@ai-chat-platform/database";
import { hermesApiUrl, readProfileApiKey } from "@ai-chat-platform/hermes";

import { trainLanguage, type TrainOptions, type TrainResult } from "./hermes-language-trainer";

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const HERMES_HOME = process.env.HERMES_HOME || path.join(REPO_ROOT, "data", "hermes");
const PROFILES_DIR = path.join(HERMES_HOME, "profiles");
const BIN = existsSync(path.join(REPO_ROOT, "vendor/hermes-agent/.venv/bin/hermes"))
  ? path.join(REPO_ROOT, "vendor/hermes-agent/.venv/bin/hermes")
  : "hermes";

const RESERVED_SLUGS = new Set(["default", "aiva-portal"]);

const GATEWAY = hermesApiUrl("").replace(/\/v1\/chat\/completions$/, "");

export interface HermesModelOptionsPayload {
  providers: Array<{
    slug: string;
    name: string;
    models: string[];
    total_models?: number;
    authenticated?: boolean;
    free_tier_row?: boolean;
    capabilities?: Record<string, { fast?: boolean; reasoning?: boolean }>;
  }>;
  model?: string;
  provider?: string;
}

export interface HermesSignInState {
  phase: "idle" | "waiting" | "done";
  link?: string;
  code?: string;
  message?: string;
}

// One sign-in flow at a time (module-level: the process is the flow's lifetime).
let signInState: HermesSignInState = { phase: "idle" };
let signInChild: ChildProcess | null = null;

export interface HermesAuthAccount {
  idx: number;
  id: string;
  label: string;
  authType: string;
  active: boolean;
  exhausted?: string;
}

export interface HermesAuthStatus {
  signedIn: boolean;
  freeTier: boolean;
  activeId?: string;
  accounts: HermesAuthAccount[];
  message?: string;
}

export interface HermesAgentSummary {
  slug: string;
  provisioned: boolean;
  model: string | null;
  provider: string | null;
  soul: string | null;
  /** API_SERVER_KEY from the profile .env — admin-only, shown so the key is
   *  recoverable without re-provisioning (the panel shows it with a copy
   *  button). Never emitted to client sessions: /api/admin/hermes-agents is
   *  gated to the fixed admin cookie. */
  apiKey: string | null;
  businesses: Array<{ id: string; name: string; slug: string; hermesEnabled: boolean }>;
}

function profileDir(slug: string): string {
  return path.join(PROFILES_DIR, slug);
}

function envPath(slug: string): string {
  return path.join(profileDir(slug), ".env");
}

function soulPath(slug: string): string {
  return path.join(profileDir(slug), "SOUL.md");
}

function readEnvValue(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"));
  const v = m ? m[1]!.trim() : "";
  return v || null;
}

function upsertEnv(raw: string, entries: Record<string, string | null>): string {
  let out = raw;
  for (const [key, value] of Object.entries(entries)) {
    const lineRe = new RegExp(`^${key}=.*$`, "m");
    if (value === null || value === "") {
      out = out.replace(lineRe, "").replace(/\n{3,}/g, "\n\n");
    } else if (lineRe.test(out)) {
      out = out.replace(lineRe, `${key}=${value}`);
    } else {
      out = out.replace(/\s*$/, "") + `\n${key}=${value}\n`;
    }
  }
  return out;
}

async function freshKey(): Promise<string> {
  const { stdout } = await execFileAsync("openssl", ["rand", "-hex", "32"]);
  return stdout.trim();
}

/**
 * Read-only access to a profile's state.db via node:sqlite (built in, no
 * dep). A missing/locked DB degrades to empty results instead of throwing —
 * insights must never 500 an agent that simply hasn't been talked to yet.
 * ponytail: synchronous is fine here; these queries are single-row aggregates.
 */
function readProfileDb(slug: string): {
  all: <T = Record<string, unknown>>(sql: string) => T[];
  one: <T = Record<string, unknown>>(sql: string) => T | null;
  close: () => void;
} {
  const empty = {
    all: <T,>(_sql: string): T[] => [],
    one: <T,>(_sql: string): T | null => null,
    close: (): void => {},
  };
  const file = path.join(profileDir(slug), "state.db");
  if (!existsSync(file)) return empty;
  try {
    // Lazy + require: node:sqlite is experimental and only needed when an
    // admin opens an agent's Insights tab.
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      // The live gateway may hold a write lock; don't fail fast on it.
      db.exec("PRAGMA busy_timeout=2000");
    } catch {
      /* advisory only */
    }
    return {
      all: <T,>(sql: string): T[] => {
        try {
          return db.prepare(sql).all() as T[];
        } catch {
          return [];
        }
      },
      one: <T,>(sql: string): T | null => {
        try {
          return (db.prepare(sql).get() as T | undefined) ?? null;
        } catch {
          return null;
        }
      },
      close: (): void => {
        try {
          db.close();
        } catch {
          /* already closed */
        }
      },
    };
  } catch {
    return empty;
  }
}

function validateSlug(slug: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    throw new Error("Slug must be lowercase letters, digits and dashes (max 64 chars).");
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`'${slug}' is reserved.`);
  }
}

/** "Sales Rep" / "sales_rep!!" -> "sales-rep" (agent NAME, never a business name). */
export function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export interface AgentBrief {
  name: string;
  role?: string;
  jobDescription?: string;
  audience?: string;
  successDefinition?: string;
  tone?: string;
  languages?: string;
  rules?: string;
  examples?: string;
}

/**
 * Compose a Hermes SOUL.md from the wizard's answers — deterministic, free,
 * no model call. Each answer becomes a labelled block; omitted answers are
 * skipped. The result is the agent's baseline persona, editable in the panel
 * and refinable by the model on demand.
 */
export function composeSoul(brief: AgentBrief): string {
  const parts: string[] = [
    `You are ${brief.name.trim()}${brief.role?.trim() ? `, ${brief.role.trim()}` : ""}. ` +
      `You are a trained, professional AI employee who does this job well and consistently.`,
  ];
  const block = (heading: string, body?: string): void => {
    const text = (body ?? "").trim();
    if (text) parts.push(`\n## ${heading}\n${text}`);
  };
  block("Your job", brief.jobDescription);
  block("Who you talk to", brief.audience);
  block("What a good day looks like", brief.successDefinition);
  block("How you speak", brief.tone);
  block("Languages", brief.languages);
  block("Hard rules", brief.rules);
  block("Example replies", brief.examples);
  parts.push(
    "\nStay in character, stay concise, and say plainly when you don't know something. " +
      "Match the length of your reply to the weight of the ask."
  );
  return parts.join("\n");
}

export class HermesAdminController {
  private async runAuthCmd(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync(BIN, args, {
      env: { ...process.env, HERMES_HOME, PYTHONUNBUFFERED: "1" },
      cwd: REPO_ROOT,
    });
    return stdout;
  }

  /**
   * Pooled Nous accounts on the platform's default agent (every agent created
   * here clones this identity). Rows come from `hermes auth list nous`; the
   * free tier is rendered separately by the CLI and never listed as a
   * credential, so signed-in == at least one countable entry.
   */
  async authStatus(): Promise<HermesAuthStatus> {
    let listOut = "";
    try {
      listOut = await this.runAuthCmd(["auth", "list", "nous"]);
    } catch {
      /* no credentials yet — treated as signed out */
    }
    const accounts: HermesAuthAccount[] = [];
    let freeTier = false;
    for (const rawLine of listOut.split("\n")) {
      const line = rawLine.trimEnd();
      const cred = line.match(/^\s*#(\d+)\s+(.+)$/);
      if (!cred) {
        if (!freeTier && /free tier/i.test(line)) freeTier = true;
        continue;
      }
      const row = cred[2]!;
      const idM = row.match(/(?:^|\s)id=(\S+)/);
      if (!idM) continue;
      const prioM = row.match(/(?:^|\s)priority=(\d+)/);
      const id = idM[1]!;
      const priority = prioM ? Number(prioM[1]) : Number.MAX_SAFE_INTEGER;
      const head = row.slice(0, idM.index ?? 0).replace(/^\s*#\d+\s*/, "").trimEnd();
      const headTok = head.split(/\s{2,}/);
      const label = headTok[0]?.trim() || id;
      const authType = (headTok.length > 1 ? headTok[headTok.length - 1] : "")?.trim() || "";
      const tail = row.slice((idM.index ?? 0) + idM[0].length);
      const status = tail.replace(/^.*?priority=\d+/, "").replace(/source=\S+/, "").replace(/\s*←\s*$/, "").trim();
      accounts.push({
        idx: Number(cred[1]),
        id,
        label,
        authType,
        active: priority === 0,
        exhausted: status || undefined,
      });
    }

    let message: string | undefined;
    let signedIn = accounts.length > 0;
    if (!signedIn) {
      let statusOut = "";
      try {
        statusOut = await this.runAuthCmd(["auth", "status", "nous"]);
      } catch {
        /* keep the logged-out verdict */
      }
      const bits = statusOut.split("\n").map((s) => s.trim()).filter(Boolean);
      const verdict = bits[0] ?? "";
      if (/(?:logged in|signed in)/i.test(verdict)) signedIn = true;
      if (/free tier/i.test(verdict)) freeTier = true;
      if (bits.length > 0) message = bits.join(" ");
    }
    return {
      signedIn,
      freeTier,
      activeId: accounts.find((a) => a.active)?.id,
      accounts,
      message,
    };
  }

  async authActivate(id: string): Promise<HermesAuthStatus> {
    if (!id) throw new Error("Account id is required.");
    await this.runAuthCmd(["auth", "priority", "nous", id, "0"]);
    return this.authStatus();
  }

  async authRemove(id: string): Promise<HermesAuthStatus> {
    if (!id) throw new Error("Account id is required.");
    await this.runAuthCmd(["auth", "remove", "nous", id]);
    return this.authStatus();
  }

  async authReset(id?: string): Promise<HermesAuthStatus> {
    const args = ["auth", "reset", "nous"];
    if (id) args.push(id);
    await this.runAuthCmd(args);
    return this.authStatus();
  }

  async list(): Promise<HermesAgentSummary[]> {
    await fs.mkdir(PROFILES_DIR, { recursive: true });
    const entries = await fs.readdir(PROFILES_DIR, { withFileTypes: true });
    // Skip hidden dirs (Hermes keeps internal tombstones in .deleted/).
    const slugs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();

    const businesses = await prisma.business.findMany({
      where: { hermesProfile: { in: slugs } },
      select: { id: true, name: true, slug: true, hermesProfile: true, hermesEnabled: true },
    });

    const out: HermesAgentSummary[] = [];
    for (const slug of slugs) {
      const envRaw = await fs.readFile(envPath(slug), "utf8").catch(() => "");
      const soul = await fs.readFile(soulPath(slug), "utf8").catch(() => null);
      out.push({
        slug,
        provisioned: Boolean(readEnvValue(envRaw, "API_SERVER_KEY")),
        model: readEnvValue(envRaw, "AIVA_MODEL"),
        provider: readEnvValue(envRaw, "AIVA_PROVIDER"),
        soul,
        apiKey: readEnvValue(envRaw, "API_SERVER_KEY"),
        businesses: businesses.filter((b) => b.hermesProfile === slug).map((b) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          hermesEnabled: b.hermesEnabled,
        })),
      });
    }
    return out;
  }

  async create(input: { slug: string; soul?: string; brief?: AgentBrief }): Promise<{ slug: string; apiKey: string }> {
    const slug = input.slug.trim().toLowerCase();
    validateSlug(slug);
    if (existsSync(profileDir(slug))) {
      throw new Error(`Agent '${slug}' already exists.`);
    }
    await execFileAsync(BIN, ["profile", "create", slug, "--clone", "--no-alias"], {
      env: { ...process.env, HERMES_HOME },
      cwd: REPO_ROOT,
    });

    const existing = await fs.readFile(envPath(slug), "utf8").catch(() => "");
    const existingKey = readEnvValue(existing, "API_SERVER_KEY");
    const apiKey = existingKey ?? (await freshKey());
    if (!existingKey) {
      await fs.writeFile(
        envPath(slug),
        `API_SERVER_ENABLED=true\nAPI_SERVER_KEY=${apiKey}\nAPI_SERVER_PORT=8642\nAPI_SERVER_HOST=127.0.0.1\n`
      );
    } else if (!/^API_SERVER_ENABLED/.test(existing)) {
      await fs.writeFile(envPath(slug), `API_SERVER_ENABLED=true\n${existing}`);
    }

    if (input.soul && input.soul.trim()) {
      await fs.writeFile(soulPath(slug), input.soul);
    } else if (input.brief) {
      await fs.writeFile(soulPath(slug), composeSoul(input.brief));
    }

    return { slug, apiKey };
  }

  async update(
    slug: string,
    input: { soul?: string; model?: string; provider?: string }
  ): Promise<{ slug: string; model: string | null; provider: string | null }> {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
      throw new Error("Invalid agent slug.");
    }
    const dir = profileDir(slug);
    if (!existsSync(dir)) {
      throw new Error(`Agent '${slug}' does not exist.`);
    }

    if (typeof input.soul === "string") {
      await fs.writeFile(soulPath(slug), input.soul);
    }

    if (input.model !== undefined || input.provider !== undefined) {
      const raw = await fs.readFile(envPath(slug), "utf8").catch(() => "");
      const edits: Record<string, string | null> = {};
      if (input.model !== undefined) edits.AIVA_MODEL = input.model.trim() || null;
      if (input.provider !== undefined) edits.AIVA_PROVIDER = input.provider.trim() || null;
      const out = upsertEnv(raw || "", edits);
      if (!/API_SERVER_KEY/.test(out)) {
        throw new Error(`Agent '${slug}' has no API_SERVER_KEY yet — provision first.`);
      }
      await fs.writeFile(envPath(slug), out);
    }

    const raw = await fs.readFile(envPath(slug), "utf8").catch(() => "");
    return { slug, model: readEnvValue(raw, "AIVA_MODEL"), provider: readEnvValue(raw, "AIVA_PROVIDER") };
  }

  /**
   * Optional model pass over the wizard-composed SOUL.md. The template is
   * always the baseline; this only tightens prose. Costs one model call, so
   * it is an explicit admin action, never part of create.
   */
  async polishSoul(slug: string): Promise<{ slug: string; soul: string }> {
    const soul = await fs.readFile(soulPath(slug), "utf8").catch(() => "");
    if (!soul.trim()) throw new Error(`Agent '${slug}' has no SOUL.md to polish.`);
    const { hermesChat } = await import("@ai-chat-platform/hermes");
    const result = await hermesChat({
      tenant: slug,
      sessionKey: `polish:${slug}`,
      timeoutMs: 120_000,
      systemPrompt:
        "You tighten AI agent personas. Return ONLY the improved persona as markdown. " +
        "Keep every concrete fact, rule, name and language; improve structure, clarity and " +
        "imperative voice. Do not add sections that were not asked for. No preamble, no code fence.",
      message: `Rewrite this persona so it reads as a trained professional employee:\n\n${soul}`,
    });
    const polished = result.answer.trim() || soul;
    await fs.writeFile(soulPath(slug), polished);
    return { slug, soul: polished };
  }

  /**
   * What the agent has learned + how it is going, read from the profile's own
   * state: Hermes' built-in memory store (memories/MEMORY.md, USER.md), the
   * skills it can load, and state.db for traffic/usage. view="raw" returns the
   * underlying message/usage rows for the explorer toggle.
   */
  async insights(slug: string, view: "curated" | "raw" = "curated"): Promise<unknown> {
    const dir = profileDir(slug);
    if (!existsSync(dir)) throw new Error(`Agent '${slug}' does not exist.`);

    const memory = await fs.readFile(path.join(dir, "memories/MEMORY.md"), "utf8").catch(() => "");
    const user = await fs.readFile(path.join(dir, "memories/USER.md"), "utf8").catch(() => "");

    // Skills the agent can actually load: a dir with a SKILL.md, one level
    // under skills/ (both skills/<name> and skills/<category>/<name> exist).
    const skills: Array<{ name: string; category: string; description: string }> = [];
    const skillsRoot = path.join(dir, "skills");
    if (existsSync(skillsRoot)) {
      for (const entry of await fs.readdir(skillsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const catDir = path.join(skillsRoot, entry.name);
        const read = async (root: string, name: string, category: string): Promise<void> => {
          const md = await fs.readFile(path.join(root, "SKILL.md"), "utf8").catch(() => "");
          if (!md.trim()) return;
          const description = md.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
          skills.push({ name, category, description });
        };
        const direct = await fs.readFile(path.join(catDir, "SKILL.md"), "utf8").catch(() => "");
        if (direct.trim()) {
          skills.push({
            name: entry.name,
            category: "general",
            description: direct.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "",
          });
          continue;
        }
        for (const sub of await fs.readdir(catDir, { withFileTypes: true })) {
          if (sub.isDirectory() && !sub.name.startsWith(".")) await read(catDir, sub.name, entry.name);
        }
      }
    }
    skills.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    const db = readProfileDb(slug);
    try {
      const totals = db.one<Record<string, number | null>>(`SELECT
          (SELECT count(*) FROM sessions)  AS sessions,
          (SELECT count(*) FROM messages) AS messages,
          (SELECT min(timestamp) FROM messages) AS first_ts,
          (SELECT max(timestamp) FROM messages) AS last_ts`);
      const usage = db.one<Record<string, number | null>>(`SELECT
          coalesce(sum(api_call_count),0)    AS calls,
          coalesce(sum(input_tokens),0)      AS input_tokens,
          coalesce(sum(output_tokens),0)     AS output_tokens,
          coalesce(sum(cache_read_tokens),0) AS cache_read_tokens`);

      if (view === "raw") {
        return {
          slug,
          raw: true,
          totals,
          usage,
          messages: db.all(
            `SELECT id, session_id, role, substr(content,1,400) AS content, timestamp
             FROM messages ORDER BY timestamp DESC LIMIT 50`
          ),
          usageRows: db.all(
            `SELECT session_id, model, task, api_call_count, input_tokens, output_tokens
             FROM session_model_usage ORDER BY rowid DESC LIMIT 25`
          ),
        };
      }

      // Daily traffic for the last 14 days (the panel's activity sparkline).
      const daily = db.all<{ day: string; n: number }>(
        `SELECT date(timestamp,'unixepoch') AS day, count(*) AS n
         FROM messages GROUP BY day ORDER BY day DESC LIMIT 14`
      ).reverse();

      return {
        slug,
        memory,
        userMemory: user,
        skills,
        totals,
        usage,
        daily,
        lastUserMessages: db
          .all<{ content: string; timestamp: number }>(
            `SELECT substr(content,1,240) AS content, timestamp
             FROM messages WHERE role='user' ORDER BY timestamp DESC LIMIT 5`
          )
          .map((r) => ({ content: r.content, at: new Date(r.timestamp * 1000).toISOString() })),
      };
    } finally {
      db.close();
    }
  }

  /** On-demand language training. See hermes-language-trainer for the caps. */
  train(slug: string, opts: TrainOptions): Promise<TrainResult> {
    if (!existsSync(profileDir(slug))) {
      return Promise.reject(new Error(`Agent '${slug}' does not exist.`));
    }
    return trainLanguage(slug, HERMES_HOME, opts);
  }

  async delete(slug: string): Promise<{ deleted: string }> {
    if (RESERVED_SLUGS.has(slug)) {
      throw new Error(`'${slug}' is a platform-reserved agent — it cannot be deleted.`);
    }
    const usedBy = await prisma.business.count({ where: { hermesProfile: slug } });
    if (usedBy > 0) {
      throw new Error(`Agent '${slug}' is assigned to ${usedBy} business(es). Unassign first.`);
    }
    const dir = profileDir(slug);
    if (!existsSync(dir)) {
      throw new Error(`Agent '${slug}' does not exist.`);
    }
    // Shell out to the Hermes CLI: raw fs.rm leaves the profile registered
    // with the gateway, which quietly recreates the directory. purge-identity
    // then drops the session/routing registration so a live gateway stops
    // re-serving the profile on its reconcile loop.
    await execFileAsync(BIN, ["profile", "delete", slug, "-y"], {
      env: { ...process.env, HERMES_HOME },
      cwd: REPO_ROOT,
    });
    await execFileAsync(BIN, ["profile", "purge-identity", slug], {
      env: { ...process.env, HERMES_HOME },
      cwd: REPO_ROOT,
    }).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
    return { deleted: slug };
  }

  /** The model-picker inventory from the gateway (per-profile when slug is given). */
  async modelOptions(opts: { slug?: string; refresh?: boolean } = {}): Promise<HermesModelOptionsPayload> {
    const slug = (opts.slug ?? "").trim();
    const profiled = slug && slug !== "default";
    const key = profiled ? await readProfileApiKey(slug) : await readProfileApiKey();
    if (!key) throw new Error("Gateway API key not found for that agent.");
    const base = profiled
      ? `${GATEWAY}/p/${encodeURIComponent(slug)}/api/model/options`
      : `${GATEWAY}/api/model/options`;
    const url = opts.refresh ? `${base}?refresh=true` : base;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Gateway model options failed (HTTP ${res.status}).`);
    return (await res.json()) as HermesModelOptionsPayload;
  }

  /**
   * Start a Nous device-code sign-in. Default (addAccount=false) runs
   * `hermes auth upgrade` — the free-tier-to-account promotion — for the home
   * profile or a named one. addAccount=true runs `hermes auth add nous
   * --type oauth` instead, so a genuinely new account lands in the pool at
   * priority 0 and becomes the active one (older accounts stay switchable).
   * The child prints the consent link + code; we keep parsing stdout until
   * approval/timeout and expose it via signInStatus().
   *
   * A signed-out "login" (addAccount not explicitly set) auto-promotes to the
   * oauth add flow: `auth upgrade` only ever errors here ("free tier is not
   * available right now"), so the panel's Authorize button must land a real
   * credential rather than show that dead-end message.
   */
  async signInStart(slug?: string, opts?: { addAccount?: boolean }): Promise<HermesSignInState> {
    if (signInChild) return signInState;
    const clean = (slug ?? "").trim();
    let addAccount = opts?.addAccount === true;
    if (!addAccount) {
      try {
        addAccount = !(await this.authStatus()).signedIn;
      } catch {
        /* keep addAccount=false if the status probe itself failed */
      }
    }
    const args = addAccount
      ? ["auth", "add", "nous", "--type", "oauth", "--no-browser", "--timeout", "900", "--priority", "0"]
      : ["auth", "upgrade", "--no-browser"];
    if (!addAccount && clean && clean !== "default") args.push("-p", clean);
    signInState = { phase: "waiting" };
    // "Add account" runs the CLI's device-code flow, but a shared Nous
    // credential at <home>/shared/nous_auth.json (written by the first login)
    // makes it adopt the existing login non-interactively — no new consent,
    // and with no TTY the import question defaults to yes. Park the shared
    // store aside for the child's lifetime so a genuinely new account gets a
    // fresh device-code approval; keep the child's refresh (a failed login
    // restores the previous store).
    const sharedPath = path.join(HERMES_HOME, "shared", "nous_auth.json");
    const asidePath = `${sharedPath}.import-${Date.now()}`;
    let movedShared = false;
    if (addAccount && existsSync(sharedPath)) {
      await fs.rename(sharedPath, asidePath);
      movedShared = true;
    }
    // HERMES_GUEST_ONBOARDING is process-env only (serve-dev.mjs sets it for the
    // gateway): without it the transfer flow precondition says the free tier is
    // unavailable, so force the gate on for this child.
    const child = spawn(BIN, args, {
      env: {
        ...process.env,
        HERMES_HOME,
        HERMES_GUEST_ONBOARDING: "1",
        // stdout is a pipe: CPython block-buffers it, which would hide the
        // consent link/code until exit. Unbuffered → scraped live.
        PYTHONUNBUFFERED: "1",
      },
      cwd: REPO_ROOT,
    });
    signInChild = child;
    let buf = "";
    const scrape = (): void => {
      const link = buf.match(/1\. Open:\s+(\S+)/)?.[1];
      const code = buf.match(/enter code:\s+(\S+)/)?.[1];
      if (link && signInState.phase === "waiting") {
        signInState = { phase: "waiting", link, code };
      }
    };
    child.stdout?.on("data", (d: Buffer) => { buf += d.toString(); scrape(); });
    child.stderr?.on("data", (d: Buffer) => { buf += d.toString(); scrape(); });
    child.on("close", (code) => {
      signInChild = null;
      if (movedShared) {
        if (code === 0) {
          void fs.rm(asidePath, { force: true });
        } else {
          void fs.rename(asidePath, sharedPath).catch(() => {});
        }
      }
      const tail = buf.trim().split("\n").filter(Boolean).pop() ?? "";
      signInState = { phase: "done", link: signInState.link, code: signInState.code, message: code === 0 ? "" : tail };
    });
    child.on("error", (err) => {
      signInChild = null;
      if (movedShared) void fs.rename(asidePath, sharedPath).catch(() => {});
      signInState = { phase: "done", message: err.message };
    });
    return signInState;
  }

  signInStatus(): HermesSignInState {
    return signInState;
  }
}