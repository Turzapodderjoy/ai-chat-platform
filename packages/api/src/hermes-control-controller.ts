// Hermes Control Room (Platform tab).
//
// Lets the admin drive Hermes itself: switch which AI/model a client agent
// uses, or ask Hermes to pull up real client chats and correct its own
// mistakes. The admin talks to the platform "default" agent; the agent asks
// for side effects by emitting a [[CTRL|{...}]] marker (the same
// structured-marker pattern as [[BOOKED]]/[[NEEDS_HUMAN]]), which this
// controller executes against the profile file system / Postgres. No
// gateway function-calling is required.
//
// Supported ops:
//   {"op":"set_model","slug":...,"provider":...,"model":...}
//   {"op":"note","slug":...,"text":...}          -> append standing
//        correction to the profile's SOUL.md so the lesson persists
//   {"op":"read_chats","slug":...,"days":N}      -> recent client chats
//        for the business using that profile, fed back for review

import { promises as fs, existsSync } from "node:fs";
import path from "node:path";

import { prisma } from "@ai-chat-platform/database";
import { hermesApiUrl, hermesChat, hermesHome, readProfileApiKey, readProfileEnv } from "@ai-chat-platform/hermes";

import type { HermesAdminController } from "./hermes-admin-controller";

const PROFILES_DIR = path.join(hermesHome(), "profiles");
const RESERVED_SLUGS = new Set(["default", "aiva-portal"]);

const KNOWS_AGENTS = `You are the Hermes Control Room — the platform admin talks to you to control client agents by plain language.

How you work:
- You always answer in plain sentences, in the admin's language.
- When the admin wants to CHANGE which AI a client agent uses (provider
  and/or model), emit exactly one line at the END of your reply:
    [[CTRL|{"op":"set_model","slug":"<profile-slug>","provider":"<provider>","model":"<model>"}]]
  then one plain sentence confirming what you are doing. Use provider/model
  names you are confident about (e.g. groq, openai, gemini). Omit a field
  ("provider" or "model") to leave that side unchanged. The system VERIFIES
  the change against the gateway and automatically reverts it if the gateway
  has no such provider/model — let the admin know if it comes back rejected.
- When the admin corrects a mistake or states a rule Hermes broke in real
  client chats, and wants it to stop happening, emit:
    [[CTRL|{"op":"note","slug":"<profile-slug>","text":"<the rule, 1-2 sentences>"}]]
  The note is saved to that agent's persona and applies from its next turn.
- When the admin asks what Hermes said to a customer, or wants you to look
  back at real chats (e.g. "what did you tell that customer yesterday"),
  emit:
    [[CTRL|{"op":"read_chats","slug":"<profile-slug>","days":N}]]
  You will receive recent transcripts back and can analyse them: point out
  anything wrong, and if the admin wants a fix, follow up with a note.
- After a onliner like "done" is not enough — briefly state the result so
  the admin knows it worked.

Active agents you can control (profile slug / which business uses it /
current model):`;

function sanitizeValue(value: unknown, maxLen = 120): string {
  return String(value ?? "")
    .replace(/[\r\n\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, maxLen);
}

function validateProfileSlug(slug: string): string {
  const s = sanitizeValue(slug, 64);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(s)) {
    throw new Error(`Invalid agent slug '${slug}'.`);
  }
  if (RESERVED_SLUGS.has(s)) {
    throw new Error(`'${s}' is a platform-reserved agent and cannot be changed here.`);
  }
  return s;
}

function profileExists(slug: string): boolean {
  return existsSync(path.join(PROFILES_DIR, slug));
}

function soulPath(slug: string): string {
  return path.join(PROFILES_DIR, slug, "SOUL.md");
}

const CTRL_PATTERN = /\[\[CTRL\|([^\[\]]+)\]\]/g;

export interface ControlTurnResult {
  answer: string;
  actions: string[];
}

export class HermesControlRoomController {
  constructor(private readonly hermes: HermesAdminController) {}

  async agents() {
    return this.hermes.list();
  }

  /** The current agent roster, as a short text index Hermes can reason over. */
  private async agentIndexText(): Promise<string> {
    const agents = await this.hermes.list();
    if (agents.length === 0) return "(no client agents provisioned yet)";
    return agents
      .map((a) => {
        const biz = a.businesses.length
          ? a.businesses.map((b) => `${b.name} (enabled=${b.hermesEnabled})`).join(", ")
          : "no business assigned";
        const ai = `${a.provider ?? "default"}/${a.model ?? "gateway default"}`;
        return `- ${a.slug}: used by ${biz}; AI = ${ai}`;
      })
      .join("\n");
  }

  /**
   * One admin turn. Runs Hermes, executes any [[CTRL]] ops it emits, and
   * keeps looping while Hermes asks for follow-up data (read_chats) or more
   * actions, so one admin message can transitively review chats, spot a
   * mistake and file the correction in a single conversation.
   */
  async turn(username: string, message: string): Promise<ControlTurnResult> {
    const key = sanitizeValue(username, 64) || "console";
    const sessionKey = `admin-control:${key}`;
    const systemPrompt = `${KNOWS_AGENTS}\n${await this.agentIndexText()}`;

    let current = message.trim();
    let lastAnswer = "";
    const actions: string[] = [];

    for (let i = 0; i < 4; i++) {
      const res = await hermesChat({
        tenant: "default",
        sessionKey,
        systemPrompt,
        message: current,
      });
      lastAnswer = res.answer;

      const commands = this.parseCommands(res.answer);
      if (commands.length === 0) break;

      const followups: string[] = [];
      for (const cmd of commands) {
        try {
          const result = await this.execute(cmd);
          actions.push(result.display);
          if (result.followUp) followups.push(result.followUp);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          actions.push(`⚠ ${msg}`);
          followups.push(`The action failed: ${msg}. Tell the admin plainly.`);
        }
      }

      if (followups.length === 0) break;
      current =
        `[Control Room — result of your request]\n${followups.join("\n\n")}\n\n` +
        `Reply to the admin with your analysis. If a further action is needed, emit another [[CTRL|...]] line; otherwise reply plainly.`;
    }

    return { answer: stripMarkers(lastAnswer), actions };
  }

  private parseCommands(answer: string): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const match of answer.matchAll(CTRL_PATTERN)) {
      try {
        const parsed = JSON.parse(match[1]!) as Record<string, unknown>;
        if (typeof parsed.op === "string") out.push(parsed);
      } catch {
        // A malformed marker is dropped — Hermes still explains itself in prose.
      }
    }
    return out;
  }

  private async execute(cmd: Record<string, unknown>): Promise<{ display: string; followUp?: string }> {
    switch (cmd.op) {
      case "set_model": {
        const slug = validateProfileSlug(String(cmd.slug ?? ""));
        if (!profileExists(slug)) throw new Error(`Agent '${slug}' does not exist.`);
        const provider = cmd.provider === undefined || cmd.provider === null ? undefined : sanitizeValue(cmd.provider);
        const model = cmd.model === undefined || cmd.model === null ? undefined : sanitizeValue(cmd.model);
        if (!provider && !model) throw new Error("set_model needs a provider or a model.");

        // Save what we're about to overwrite so a rejected override can be
        // rolled back instead of silently leaving the client agent degraded.
        const prev = await readProfileEnv(slug);
        await this.hermes.update(slug, { provider, model });
        try {
          await probeProfile(slug);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await this.hermes.update(slug, { provider: prev.aivaProvider ?? "", model: prev.aivaModel ?? "" });
          throw new Error(`The gateway rejected ${provider ?? "default"}/${model ?? "default"} (${reason}); the agent was left unchanged.`);
        }
        return {
          display: `✓ ${slug} is now ${provider || "—"} / ${model || "gateway default"}`,
          followUp: `set_model executed and verified on '${slug}': provider=${provider ?? "(unchanged)"}, model=${model ?? "(unchanged)"}.`,
        };
      }
      case "note": {
        const slug = validateProfileSlug(String(cmd.slug ?? ""));
        if (!profileExists(slug)) throw new Error(`Agent '${slug}' does not exist.`);
        const text = sanitizeValue(cmd.text, 400);
        if (!text) throw new Error("note needs a text.");
        const soul = await fs.readFile(soulPath(slug), "utf8").catch(() => "");
        const heading = "\n\n## Standing corrections (Control Room)\n";
        const bullet = `- ${text}`;
        const next = soul.includes(heading) ? `${soul.replace(/^(## Standing corrections \(Control Room\)\n)/m, `$1${bullet}\n`)}` : `${soul}${heading}${bullet}\n`;
        await fs.writeFile(soulPath(slug), next.trimEnd() + "\n");
        return {
          display: `✓ Correction saved to ${slug}`,
          followUp: `note recorded in '${slug}'s persona. It applies on the agent's next turn.`,
        };
      }
      case "read_chats": {
        const slug = validateProfileSlug(String(cmd.slug ?? ""));
        const biz = await prisma.business.findFirst({
          where: { hermesProfile: slug },
          select: { id: true, name: true },
        });
        if (!biz) throw new Error(`No business uses profile '${slug}'.`);
        const days = Math.min(Math.max(Number(cmd.days) || 1, 1), 60);
        const since = new Date(Date.now() - days * 86_400_000);
        const conversations = await prisma.conversation.findMany({
          where: { businessId: biz.id, updatedAt: { gte: since } },
          orderBy: { updatedAt: "desc" },
          take: 8,
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              take: 20,
              select: { role: true, content: true, provider: true, createdAt: true },
            },
          },
        });

        if (conversations.length === 0) {
          return {
            display: `📞 No chats for ${biz.name} in the last ${days} day(s)`,
            followUp: `There were no client conversations for ${biz.name} in the last ${days} day(s).`,
          };
        }

        let body = `Recent client chats for ${biz.name} (last ${days} day(s)):\n`;
        let budget = 14_000;
        outer: for (const conv of conversations) {
          if (budget <= 0) break;
          const head = `## ${conv.id} (${conv.channel}, ${conv.updatedAt.toISOString()})`;
          body += `\n${head}\n`;
          for (const msg of conv.messages.slice(-10)) {
            const role = msg.role === "assistant" ? `hermes${msg.provider ? ` (${msg.provider})` : ""}` : msg.role;
            let content = msg.content.trim().replace(/\s+/g, " ");
            if (content.length > 320) content = `${content.slice(0, 320)}…`;
            const line = `- [${role}] ${content}`;
            if (line.length > budget) break outer;
            body += `${line}\n`;
            budget -= line.length;
          }
        }
        return {
          display: `📞 Read ${conversations.length} conversation(s) for ${biz.name}`,
          followUp: body.trimEnd(),
        };
      }
      default:
        return { display: `⚠ Unknown control op '${String(cmd.op)}' (skipped)` };
    }
  }
}

function stripMarkers(answer: string): string {
  return answer.replace(CTRL_PATTERN, "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Send one throwaway turn to a profile wearing its current override and
 * reject it when the gateway answers with a degraded completion (unknown
 * provider, auth failure, warning glyph). Talks to the gateway DIRECTLY —
 * hermesChat's degraded-override fallback would silently mask a broken
 * provider by re-answering with the safe default, which makes the probe
 * useless for verifying a set_model.
 */
async function probeProfile(slug: string): Promise<void> {
  const env = await readProfileEnv(slug);
  const apiKey = env.apiKey ?? (await readProfileApiKey(slug));
  if (!apiKey) throw new Error("profile has no API_SERVER_KEY to probe with");

  const body: Record<string, unknown> = {
    model: env.aivaModel || "nous/welcome",
    messages: [{ role: "user", content: "Say exactly: ok" }],
    stream: false,
  };
  if (env.aivaProvider) body.provider = env.aivaProvider;

  let res: Response | null = null;
  try {
    res = await Promise.race([
      fetch(hermesApiUrl(slug), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Hermes-Session-Key": `ctrl-probe:${slug}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("probe timed out after 60s")), 60_000)
      ),
    ]);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }

  const answer: string = res.ok
    ? String(((await res.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string | null } }> }).choices?.[0]?.message?.content ?? "")).trim()
    : "";
  const degraded = /^⚠️|authentication failed|unknown provider|provider .{0,40} not .{0,10}|not (found|supported|configured)|provider .{0,40} failed/i;
  if (!res.ok || !answer || degraded.test(answer)) {
    throw new Error(res.ok ? (answer || "empty completion").slice(0, 140) : `HTTP ${res.status}`);
  }
}