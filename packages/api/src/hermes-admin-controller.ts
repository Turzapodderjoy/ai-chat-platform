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

export interface HermesAgentSummary {
  slug: string;
  provisioned: boolean;
  model: string | null;
  provider: string | null;
  soul: string | null;
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

function validateSlug(slug: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    throw new Error("Slug must be lowercase letters, digits and dashes (max 64 chars).");
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`'${slug}' is reserved.`);
  }
}

export class HermesAdminController {
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

  async create(input: { slug: string; soul?: string }): Promise<{ slug: string; apiKey: string }> {
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
   * Start `hermes auth upgrade` (device-code sign-in to Nous) for the home
   * profile or a named one. The child prints the consent link + code; we keep
   * parsing stdout until approval/timeout and expose it via signInStatus().
   */
  async signInStart(slug?: string): Promise<HermesSignInState> {
    if (signInChild) return signInState;
    const clean = (slug ?? "").trim();
    const args = ["auth", "upgrade", "--no-browser"];
    if (clean && clean !== "default") args.push("-p", clean);
    signInState = { phase: "waiting" };
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
      const tail = buf.trim().split("\n").filter(Boolean).pop() ?? "";
      signInState = { phase: "done", link: signInState.link, code: signInState.code, message: code === 0 ? "" : tail };
    });
    child.on("error", (err) => {
      signInChild = null;
      signInState = { phase: "done", message: err.message };
    });
    return signInState;
  }

  signInStatus(): HermesSignInState {
    return signInState;
  }
}