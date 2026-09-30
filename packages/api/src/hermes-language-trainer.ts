// Agent language trainer.
//
// An on-demand, hard-capped pipeline that teaches a Hermes profile a language
// and the register to use it, then persists the result as a real Hermes skill
// the agent loads at runtime (skills/language-<code>/SKILL.md) plus distilled
// notes in its built-in memory store (memories/MEMORY.md).
//
// Design constraints this file exists to satisfy:
//   - Cost. The Nous account is free-tier with $0 credits, so a run spends
//     tokens. Everything is bounded (pages, chars, seconds) and the whole run
//     makes exactly ONE distillation model call — never one per page. Fetches
//     are cached by content hash so re-training a language only distills delta.
//   - SSRF. The box is publicly reachable behind a tunnel, so paste-URLs are
//     opt-in and validated: https/http only, DNS resolved and every resolved
//     address checked against private/loopback/link-local ranges, redirects
//     followed manually with the same checks, hard body + time caps.
//   - Resumability. Run state is persisted per profile+language so a scheduled
//     job can call this later without rework; each run records what it did.

import { promises as fs, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";

import { hermesChat } from "@ai-chat-platform/hermes";

export interface TrainOptions {
  /** BCP-47-ish language code/name, e.g. "es", "Brazilian Portuguese". */
  language: string;
  /** Opt-in extra sources; each validated like any other fetch target. */
  urls?: string[];
  /** Max allowlisted+paste pages to fetch. Default 6. */
  maxPages?: number;
  /** Max characters of source text fed to the single distillation call. */
  maxChars?: number;
  /** Wall-clock budget for the run in seconds. Default 120. */
  maxSeconds?: number;
}

export interface TrainResult {
  slug: string;
  language: string;
  code: string;
  fetched: number;
  chars: number;
  capped: boolean;
  cachedHits: number;
  skillPath: string;
  memoryAdded: boolean;
  seconds: number;
  summary: string;
}

// ── allowlisted source hosts (default path — no arbitrary fetch) ────────────
// Public, open, machine-readable-ish sources that are safe to scrape and
// stable enough to rely on. Adding a host is a code change on purpose.
const ALLOWLIST: Record<string, string[]> = {
  // Phrase/lexicon oriented.
  wiktionary: ["en.wiktionary.org", "es.wiktionary.org", "pt.wiktionary.org", "fr.wiktionary.org", "de.wiktionary.org"],
  wikipedia: ["en.wikipedia.org", "es.wikipedia.org", "pt.wikipedia.org", "fr.wikipedia.org", "de.wikipedia.org"],
  // Register/culture oriented (usage guides & etiquette).
  wikibooks: ["en.wikibooks.org"],
  wikihow: ["www.wikihow.com"],
};

const UA = "AIVA-AgentTrainer/1.0 (+admin on-demand language training)";
const DEFAULTS = { maxPages: 6, maxChars: 12000, maxSeconds: 120 };

// ── SSRF guards ─────────────────────────────────────────────────────────────
function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isBlockedAddr(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true;
  // Unspecified/loopback, link-local (fe80::/10), unique-local (fc00::/7),
  // multicast (ff00::/8) and the documentation range are all unroutable to
  // anything we'd legitimately want to train from.
  if (/^(fe8|fe9|fea|feb)/.test(low)) return true;
  if (/^f[cd]/.test(low)) return true;
  if (low.startsWith("ff")) return true;
  if (low.startsWith("2001:db8")) return true;
  // IPv4-mapped IPv6
  const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isPrivateIPv4(mapped);
  return false;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error(`Only http(s) URLs allowed: ${raw}`);
  }
  if (u.username || u.password) throw new Error("URLs with credentials are not allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isBlockedAddr(a.address))) {
    throw new Error(`Refusing to fetch a private/internal address: ${host}`);
  }
  return u;
}

// ── fetch + extract ─────────────────────────────────────────────────────────
const MAX_BODY = 400_000; // bytes

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchOne(url: string, deadline: number): Promise<{ text: string; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (Date.now() > deadline) throw new Error("time cap reached while fetching");
    const u = await assertPublicUrl(current);
    const budgetMs = Math.max(1000, Math.min(15000, deadline - Date.now()));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), budgetMs);
    try {
      const res = await fetch(u, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, u).toString();
        continue; // re-validate the redirect target through assertPublicUrl
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_BODY) throw new Error("body too large");
      const ctype = res.headers.get("content-type") ?? "";
      const body = buf.toString("utf8");
      return { text: ctype.includes("html") ? htmlToText(body) : body.slice(0, MAX_BODY), finalUrl: u.toString() };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("too many redirects");
}

// ── source selection ────────────────────────────────────────────────────────
// ISO-639-1 -> that language's OWN Wikipedia/Wiktionary, so the pack is
// distilled from sources WRITTEN IN the target language (native idiom) rather
// than its article on an English wiki. Any unlisted two-letter code still
// resolves heuristically to <code>.<tld>; unresolvable names fall back to the
// platform-standard hosts below. All entries stay within the SSRF allowlist.
const LANGUAGE_WIKIS: Record<string, { wikipedia?: string; wiktionary?: string }> = {
  en: { wikipedia: "en.wikipedia.org", wiktionary: "en.wiktionary.org" },
  es: { wikipedia: "es.wikipedia.org", wiktionary: "es.wiktionary.org" },
  pt: { wikipedia: "pt.wikipedia.org", wiktionary: "pt.wiktionary.org" },
  fr: { wikipedia: "fr.wikipedia.org", wiktionary: "fr.wiktionary.org" },
  de: { wikipedia: "de.wikipedia.org", wiktionary: "de.wiktionary.org" },
  hi: { wikipedia: "hi.wikipedia.org", wiktionary: "hi.wiktionary.org" },
  bn: { wikipedia: "bn.wikipedia.org", wiktionary: "bn.wiktionary.org" },
  ar: { wikipedia: "ar.wikipedia.org", wiktionary: "ar.wiktionary.org" },
  ur: { wikipedia: "ur.wikipedia.org", wiktionary: "ur.wiktionary.org" },
  tl: { wikipedia: "tl.wikipedia.org", wiktionary: "tl.wiktionary.org" },
  vi: { wikipedia: "vi.wikipedia.org", wiktionary: "vi.wiktionary.org" },
  id: { wikipedia: "id.wikipedia.org", wiktionary: "id.wiktionary.org" },
  ms: { wikipedia: "ms.wikipedia.org", wiktionary: "ms.wiktionary.org" },
  th: { wikipedia: "th.wikipedia.org", wiktionary: "th.wiktionary.org" },
  zh: { wikipedia: "zh.wikipedia.org", wiktionary: "zh.wiktionary.org" },
  ja: { wikipedia: "ja.wikipedia.org", wiktionary: "ja.wiktionary.org" },
  ko: { wikipedia: "ko.wikipedia.org", wiktionary: "ko.wiktionary.org" },
  sw: { wikipedia: "sw.wikipedia.org", wiktionary: "sw.wiktionary.org" },
  tr: { wikipedia: "tr.wikipedia.org", wiktionary: "tr.wiktionary.org" },
  ru: { wikipedia: "ru.wikipedia.org", wiktionary: "ru.wiktionary.org" },
  it: { wikipedia: "it.wikipedia.org", wiktionary: "it.wiktionary.org" },
  nl: { wikipedia: "nl.wikipedia.org", wiktionary: "nl.wiktionary.org" },
  pl: { wikipedia: "pl.wikipedia.org", wiktionary: "pl.wiktionary.org" },
  sv: { wikipedia: "sv.wikipedia.org", wiktionary: "sv.wiktionary.org" },
};
const LANGUAGE_NAME_CODES: Record<string, string> = {
  english: "en", spanish: "es", portuguese: "pt", "brazilian portuguese": "pt-br",
  french: "fr", german: "de", hindi: "hi", bengali: "bn", bangla: "bn", arabic: "ar",
  urdu: "ur", tagalog: "tl", filipino: "tl", vietnamese: "vi", indonesian: "id",
  malay: "ms", thai: "th", chinese: "zh", mandarin: "zh", japanese: "ja",
  korean: "ko", swahili: "sw", turkish: "tr", russian: "ru", italian: "it",
  dutch: "nl", polish: "pl", swedish: "sv",
};

function languageWikiHosts(language: string, code: string): { wikipedia?: string; wiktionary?: string } {
  const byName = LANGUAGE_NAME_CODES[language.trim().toLowerCase()];
  const base = (byName ?? code).split("-")[0]!;
  const explicit = LANGUAGE_WIKIS[base];
  if (explicit) return explicit;
  // Any other ISO-639-1 pair still gets its own wiki; a non-existent one is
  // simply dropped by the fetch later (unreachable sources never fail a run).
  return { wikipedia: `${base}.wikipedia.org`, wiktionary: `${base}.wiktionary.org` };
}

function allowlistUrls(language: string, code: string, max: number): string[] {
  const hosts = languageWikiHosts(language, code);
  const urls: string[] = [];
  if (hosts.wikipedia) urls.push(`https://${hosts.wikipedia}/wiki/${encodeURIComponent(language)}`);
  if (hosts.wiktionary) urls.push(`https://${hosts.wiktionary}/wiki/${encodeURIComponent(language)}`);
  urls.push(...(ALLOWLIST.wikibooks ?? []).slice(0, 1).map((h) => `https://${h}`));
  return urls.slice(0, max);
}

// ── persistence helpers ─────────────────────────────────────────────────────
function profileDir(home: string, slug: string): string {
  return path.join(home, "profiles", slug);
}
function trainerStatePath(home: string, slug: string): string {
  return path.join(profileDir(home, slug), "cache", "trainer-state.json");
}
function fetchCachePath(home: string, slug: string): string {
  return path.join(profileDir(home, slug), "cache", "trainer-fetch-cache.json");
}
function languageCode(language: string): string {
  const base = language.toLowerCase().split(/[\s,/()-]/)[0]!.replace(/[^a-z]/g, "");
  return base.slice(0, 8) || "xx";
}

interface FetchCache {
  [url: string]: { hash: string; text: string; at: number };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8").catch(() => JSON.stringify(fallback))) as T;
}
async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

// ── the run ─────────────────────────────────────────────────────────────────
export async function trainLanguage(
  slug: string,
  home: string,
  opts: TrainOptions
): Promise<TrainResult> {
  const started = Date.now();
  const language = (opts.language ?? "").trim();
  if (!language) throw new Error("A language is required.");
  const maxPages = Math.min(Math.max(opts.maxPages ?? DEFAULTS.maxPages, 1), 12);
  const maxChars = Math.min(Math.max(opts.maxChars ?? DEFAULTS.maxChars, 500), 40000);
  const maxSeconds = Math.min(Math.max(opts.maxSeconds ?? DEFAULTS.maxSeconds, 10), 600);
  const deadline = started + maxSeconds * 1000;
  const code = languageCode(language);

  const dir = profileDir(home, slug);
  if (!existsSync(dir)) throw new Error(`Agent '${slug}' does not exist.`);

  const cacheFile = fetchCachePath(home, slug);
  const cache = await readJson<FetchCache>(cacheFile, {});

  // Candidate sources. The page budget is a TOTAL cap across the native-host
  // allowlist and any pasted URLs — the admin's explicit URLs win the budget.
  const usr = [...new Set((opts.urls ?? []).map((s) => s.trim()).filter(Boolean))].slice(0, maxPages);
  const allow = allowlistUrls(language, code, Math.max(1, maxPages - usr.length));
  const candidates: Array<{ url: string; optIn: boolean }> = [
    ...usr.map((url) => ({ url, optIn: true })),
    ...allow.slice(0, Math.max(0, maxPages - usr.length)).map((url) => ({ url, optIn: false })),
  ];

  const chunks: string[] = [];
  let chars = 0;
  let fetched = 0;
  let cachedHits = 0;
  let capped = false;
  const seen = new Set<string>();

  for (const cand of candidates) {
    if (chars >= maxChars || Date.now() > deadline) {
      capped = true;
      break;
    }
    if (seen.has(cand.url)) continue;
    seen.add(cand.url);
    try {
      const hash = createHash("sha256").update(cand.url).digest("hex").slice(0, 16);
      let text: string;
      if (cache[cand.url]) {
        text = cache[cand.url]!.text;
        cachedHits++;
      } else {
        const res = await fetchOne(cand.url, deadline);
        text = res.text;
        cache[cand.url] = { hash, text, at: Date.now() };
      }
      const take = text.slice(0, Math.max(0, Math.min(text.length, maxChars - chars)));
      if (take.trim().length < 50) continue; // nav-only / empty page
      chunks.push(`### Source: ${cand.url}\n${take}`);
      chars += take.length;
      fetched++;
      // Persist cache as we go so an interrupted run still saves fetches.
      await writeJson(cacheFile, cache);
    } catch (err) {
      // A dead/filtered source must not fail the whole run.
      chunks.push(`### Source: ${cand.url}\n[unavailable: ${(err as Error).message.slice(0, 80)}]`);
    }
  }
  if (chars >= maxChars) capped = true;

  // The single distillation call that turns source text into a usable pack.
  const digest = chunks.join("\n\n").slice(0, maxChars);
  const { answer: answerRaw } = await hermesChat({
    tenant: slug,
    sessionKey: `train:${slug}:${code}`,
    timeoutMs: Math.max(30_000, Math.min(180_000, deadline - Date.now())),
    systemPrompt:
      "You are a language and communication coach. You produce a practical, compact " +
      "language pack that another AI agent will follow to sound like a fluent native " +
      "customer-service speaker in the target language. Return ONLY markdown. Be concrete " +
      "and example-rich; never pad.",
    message: `Write a language + communication pack for an AI customer-service agent speaking ${language}.

The ENTIRE pack must be written IN ${language} itself — headings, examples and all — so a reader who knows no English can follow it.

Make the agent sound like a local, never like translated or politely written English:
- Use the real everyday register of ${language}: natural word order, contractions/short forms, filler and politeness particles a native actually uses.
- Match the local politeness and honorific culture for customer service (forms of address, respectful verb forms, informal vs formal address) and say WHICH register to use with customers.
- Give common customer-service sentences exactly as a local would say them, plus the top mistakes a foreigner makes and why they sound robotic.
- Keep any code-switched words (e.g. English product names) the way locals actually keep them.

Cover: core everyday phrasing, register and politeness norms, how to sound warm and human (not robotic or translated), common mistakes to avoid, and 5 short example exchanges.

Use this source material (may be noisy; it is native-language material, trust it over inventing):
${digest}`,
  });

  // hermesChat resolves with an error code (e.g. "platform.api_server.
  // provider_error_line") instead of throwing when the model call fails.
  // Persisting that as a language skill would tell the admin the agent
  // "learned" an error message, so refuse instead.
  const answer = answerRaw.trim();
  if (!answer || answer.length < 40 || /^(platform|internal|error)\.[a-z_.]+$/i.test(answer)) {
    throw new Error(
      `Language training failed: the model returned no usable pack (${answer.slice(0, 120) || "empty response"}).`
    );
  }

  // Persist as a real, loadable Hermes skill.
  const skillDir = path.join(dir, "skills", `language-${code}`);
  const skillPath = path.join(skillDir, "SKILL.md");
  const skillMd =
    `---\n` +
    `name: language-${code}\n` +
    `description: Natural, human-level communication in ${language} — phrasing, register and pitfalls for customer replies.\n` +
    `version: 1.0.0\n` +
    `metadata:\n` +
    `  hermes:\n` +
    `    tags: [language, ${code}, communication]\n` +
    `---\n\n` +
    `# ${language} communication pack\n\n` +
    `_Trained ${new Date().toISOString().slice(0, 10)} · sources: ${fetched} (${cachedHits} cached)_\n\n` +
    `${answer.trim()}\n`;
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(skillPath, skillMd);

  // A short pointer in MEMORY.md so the built-in memory store records the skill.
  const memoryPath = path.join(dir, "memories/MEMORY.md");
  const memory = await fs.readFile(memoryPath, "utf8").catch(() => "");
  const marker = `## Language: ${language}`;
  let memoryAdded = false;
  if (!memory.includes(marker)) {
    const line = `${marker} — trained ${new Date().toISOString().slice(0, 10)}; see skills/language-${code}/SKILL.md for phrasing, register and pitfalls.`;
    await fs.mkdir(path.dirname(memoryPath), { recursive: true });
    await fs.writeFile(memoryPath, (memory ? memory.trimEnd() + "\n\n" : "# Memory\n\n") + line + "\n");
    memoryAdded = true;
  }

  // Persist run state (resumable / cron-ready).
  const stateFile = trainerStatePath(home, slug);
  const state = await readJson<Record<string, unknown>>(stateFile, {});
  state[code] = { language, at: Date.now(), fetched, cachedHits, chars, capped, summary: answer.slice(0, 200) };
  await writeJson(stateFile, state);

  return {
    slug,
    language,
    code,
    fetched,
    chars,
    capped,
    cachedHits,
    skillPath: `skills/language-${code}/SKILL.md`,
    memoryAdded,
    seconds: Math.round((Date.now() - started) / 1000),
    summary: answer.slice(0, 400),
  };
}
