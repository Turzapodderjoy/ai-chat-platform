import { prisma } from "@ai-chat-platform/database";

import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_HANDOFF_FLOOR,
  DEFAULT_HISTORY_TURNS,
  DEFAULT_TEMPERATURE,
  PLATFORM_CONFIG_ID,
} from "./defaults";

export { PLATFORM_CONFIG_ID };

export interface AiConfig {
  id: string;
  businessId: string;
  systemPrompt: string;
  handoffFloor: number;
  historyTurns: number;
  temperature: number;
  /** "auto" | "english" | "bangla" | "banglish" — see schema comment. */
  languageMode: string;
  /** "current" (Gemini text description) | "mimo" (MiMo direct image). */
  visionMode: string;
  maxTokens: number;
  topP: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  stopSequences: string | null;
  seed: number | null;
  changeType: string;
  note: string | null;
  createdAt: string;
}

export interface AiConfigParameters {
  maxTokens: number;
  topP: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  stopSequences: string | null;
  seed: number | null;
}

type Row = {
  id: string;
  businessId: string;
  systemPrompt: string;
  handoffFloor: number;
  historyTurns: number;
  temperature: number;
  languageMode: string;
  visionMode: string;
  maxTokens: number;
  topP: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  stopSequences: string | null;
  seed: number | null;
  changeType: string;
  note: string | null;
  createdAt: Date;
};

function toConfig(row: Row): AiConfig {
  return {
    id: row.id,
    businessId: row.businessId,
    systemPrompt: row.systemPrompt,
    handoffFloor: row.handoffFloor,
    historyTurns: row.historyTurns,
    temperature: row.temperature,
    languageMode: row.languageMode,
    visionMode: row.visionMode,
    maxTokens: row.maxTokens,
    topP: row.topP,
    frequencyPenalty: row.frequencyPenalty,
    presencePenalty: row.presencePenalty,
    stopSequences: row.stopSequences,
    seed: row.seed,
    changeType: row.changeType,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The "AI brain" — system prompt plus the numeric knobs that decide how
 * eagerly it hands off vs. tries to answer, and how creative it is.
 * Every change is a new immutable row (see schema comment), so this
 * table is both the live config and its own full audit trail.
 *
 * Scoped per businessId. A client with no saved config of their own
 * inherits the platform ("__platform__") default; the moment they save
 * their own change, they get their own row and are independent from
 * then on. Clients never write to or read each other's rows.
 */
export class AiConfigService {
  // Structurally typed (not importing ResponseCache directly) to avoid a
  // circular package dependency -- chat-service already depends on
  // ai-config for the config itself. Optional so tests/callers that don't
  // care about cache invalidation don't need to supply one. Without this,
  // a prompt fix meant to correct a wrong answer would keep losing to the
  // old (wrong) cached answer for that exact question indefinitely --
  // confirmed live: a real category-substitution bug stayed reproducible
  // after the prompt was fixed, purely because the cache never noticed.
  constructor(private readonly responseCache?: { clearForBusiness(businessId: string): void }) {}

  async getCurrent(businessId: string = PLATFORM_CONFIG_ID): Promise<AiConfig> {
    const latest = await prisma.aiConfigVersion.findFirst({
      where: { businessId },
      orderBy: { createdAt: "desc" },
    });

    if (latest) {
      return toConfig(latest);
    }

    // A client with no config of their own yet — inherit the platform
    // default instead of seeding a client-specific row. Only an explicit
    // save (update/append) creates one.
    if (businessId !== PLATFORM_CONFIG_ID) {
      return this.getCurrent(PLATFORM_CONFIG_ID);
    }

    // First ever run — seed a real baseline row so "current" always
    // exists and history has a clear starting point.
    const seeded = await prisma.aiConfigVersion.create({
      data: {
        businessId: PLATFORM_CONFIG_ID,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        handoffFloor: DEFAULT_HANDOFF_FLOOR,
        historyTurns: DEFAULT_HISTORY_TURNS,
        temperature: DEFAULT_TEMPERATURE,
        changeType: "seed",
        note: "Initial built-in configuration",
      },
    });

    return toConfig(seeded);
  }

  /** Full replace — used by the dashboard's "Update" button. Carries the
   * current languageMode forward unchanged (that's its own dedicated
   * setLanguageMode() control below) — without this, every prompt edit
   * would silently reset any language lock back to "auto". */
  async update(
    businessId: string,
    systemPrompt: string,
    handoffFloor: number,
    historyTurns: number,
    temperature: number,
    note?: string
  ): Promise<AiConfig> {
    const current = await this.getCurrent(businessId);

    const created = await prisma.aiConfigVersion.create({
      data: {
        businessId,
        systemPrompt,
        handoffFloor,
        historyTurns,
        temperature,
        languageMode: current.languageMode,
        visionMode: current.visionMode,
        maxTokens: current.maxTokens,
        topP: current.topP,
        frequencyPenalty: current.frequencyPenalty,
        presencePenalty: current.presencePenalty,
        stopSequences: current.stopSequences,
        seed: current.seed,
        changeType: "update",
        note: note?.trim() || null,
      },
    });

    this.responseCache?.clearForBusiness(businessId);
    return toConfig(created);
  }

  /** Appends new instructions onto the current prompt instead of
   * replacing it — for "also always do/never do X" additions without
   * having to paste and edit the whole prompt each time. */
  async append(
    businessId: string,
    additionalText: string,
    note?: string
  ): Promise<AiConfig> {
    const current = await this.getCurrent(businessId);
    const combined = `${current.systemPrompt}\n\n${additionalText.trim()}`.trim();

    const created = await prisma.aiConfigVersion.create({
      data: {
        businessId,
        systemPrompt: combined,
        handoffFloor: current.handoffFloor,
        historyTurns: current.historyTurns,
        temperature: current.temperature,
        languageMode: current.languageMode,
        visionMode: current.visionMode,
        maxTokens: current.maxTokens,
        topP: current.topP,
        frequencyPenalty: current.frequencyPenalty,
        presencePenalty: current.presencePenalty,
        stopSequences: current.stopSequences,
        seed: current.seed,
        changeType: "append",
        note: note?.trim() || additionalText.trim().slice(0, 120),
      },
    });

    this.responseCache?.clearForBusiness(businessId);
    return toConfig(created);
  }

  /** Locks (or unlocks, via "auto") which language the AI replies in,
   * regardless of what language the customer writes in — a separate
   * lightweight control from the full prompt editor, so toggling it
   * doesn't require touching the prompt text itself. Everything else
   * (prompt, floor, turns, temperature) carries forward unchanged. */
  async setLanguageMode(businessId: string, languageMode: string, note?: string): Promise<AiConfig> {
    const current = await this.getCurrent(businessId);

    const created = await prisma.aiConfigVersion.create({
      data: {
        businessId,
        systemPrompt: current.systemPrompt,
        handoffFloor: current.handoffFloor,
        historyTurns: current.historyTurns,
        temperature: current.temperature,
        languageMode,
        visionMode: current.visionMode,
        maxTokens: current.maxTokens,
        topP: current.topP,
        frequencyPenalty: current.frequencyPenalty,
        presencePenalty: current.presencePenalty,
        stopSequences: current.stopSequences,
        seed: current.seed,
        changeType: "language",
        note: note?.trim() || `Language locked to ${languageMode}`,
      },
    });

    this.responseCache?.clearForBusiness(businessId);
    return toConfig(created);
  }

  /** Overrides all AI providers for this business with the same tuning
   * parameters (answer length, sampling controls) — a separate control
   * from the prompt editor, so tuning knobs don't require touching prompt
   * text. Everything else (prompt, floor, turns, temperature, language)
   * carries forward unchanged. */
  async setParameters(
    businessId: string,
    params: AiConfigParameters,
    note?: string
  ): Promise<AiConfig> {
    const current = await this.getCurrent(businessId);

    const created = await prisma.aiConfigVersion.create({
      data: {
        businessId,
        systemPrompt: current.systemPrompt,
        handoffFloor: current.handoffFloor,
        historyTurns: current.historyTurns,
        temperature: current.temperature,
        languageMode: current.languageMode,
        visionMode: current.visionMode,
        maxTokens: params.maxTokens,
        topP: params.topP,
        frequencyPenalty: params.frequencyPenalty,
        presencePenalty: params.presencePenalty,
        stopSequences: params.stopSequences,
        seed: params.seed,
        changeType: "parameters",
        note: note?.trim() || "Updated AI parameters",
      },
    });

    this.responseCache?.clearForBusiness(businessId);
    return toConfig(created);
  }

  async history(
    businessId: string = PLATFORM_CONFIG_ID,
    limit = 50
  ): Promise<AiConfig[]> {
    const rows = await prisma.aiConfigVersion.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return rows.map(toConfig);
  }

  /** Switches between "current" (Gemini text description) and "mimo"
   * (MiMo direct image) vision modes. Everything else carries forward. */
  async setVisionMode(businessId: string, visionMode: string, note?: string): Promise<AiConfig> {
    const current = await this.getCurrent(businessId);

    const created = await prisma.aiConfigVersion.create({
      data: {
        businessId,
        systemPrompt: current.systemPrompt,
        handoffFloor: current.handoffFloor,
        historyTurns: current.historyTurns,
        temperature: current.temperature,
        languageMode: current.languageMode,
        visionMode,
        maxTokens: current.maxTokens,
        topP: current.topP,
        frequencyPenalty: current.frequencyPenalty,
        presencePenalty: current.presencePenalty,
        stopSequences: current.stopSequences,
        seed: current.seed,
        changeType: "vision",
        note: note?.trim() || `Vision mode set to ${visionMode}`,
      },
    });

    this.responseCache?.clearForBusiness(businessId);
    return toConfig(created);
  }
}
