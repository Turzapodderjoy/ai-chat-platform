import { AiConfigService, PLATFORM_CONFIG_ID } from "@ai-chat-platform/ai-config";
import type { AiConfigParameters } from "@ai-chat-platform/ai-config";
import type { TenantService } from "@ai-chat-platform/tenant";

export class AiConfigController {
  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly tenants: TenantService
  ) {}

  current(businessId: string = PLATFORM_CONFIG_ID) {
    return this.aiConfig.getCurrent(businessId);
  }

  history(businessId: string = PLATFORM_CONFIG_ID, limit?: number) {
    return this.aiConfig.history(businessId, limit);
  }

  update(
    systemPrompt: string,
    handoffFloor: number,
    historyTurns: number,
    temperature: number,
    note?: string,
    businessId: string = PLATFORM_CONFIG_ID
  ) {
    if (!systemPrompt.trim()) {
      throw new Error("System prompt is required.");
    }

    if (!(handoffFloor >= 0 && handoffFloor <= 1)) {
      throw new Error("Handoff floor must be between 0 and 1.");
    }

    if (!(historyTurns >= 0)) {
      throw new Error("History turns must be 0 or more.");
    }

    if (!(temperature >= 0 && temperature <= 1)) {
      throw new Error("Temperature must be between 0 and 1.");
    }

    return this.aiConfig.update(businessId, systemPrompt, handoffFloor, historyTurns, temperature, note);
  }

  append(additionalText: string, note?: string, businessId: string = PLATFORM_CONFIG_ID) {
    if (!additionalText.trim()) {
      throw new Error("Text to add is required.");
    }

    return this.aiConfig.append(businessId, additionalText, note);
  }

  /** Overrides all AI providers for this business with the same tuning
   * parameters — the "Parameters" tab's Save button. */
  updateParameters(params: AiConfigParameters, note?: string, businessId: string = PLATFORM_CONFIG_ID) {
    if (!(params.maxTokens >= 1)) {
      throw new Error("maxTokens must be at least 1.");
    }

    if (params.topP != null && !(params.topP >= 0 && params.topP <= 1)) {
      throw new Error("topP must be between 0 and 1.");
    }

    if (params.frequencyPenalty != null && !(params.frequencyPenalty >= -2 && params.frequencyPenalty <= 2)) {
      throw new Error("frequencyPenalty must be between -2 and 2.");
    }

    if (params.presencePenalty != null && !(params.presencePenalty >= -2 && params.presencePenalty <= 2)) {
      throw new Error("presencePenalty must be between -2 and 2.");
    }

    return this.aiConfig.setParameters(businessId, params, note);
  }

  private static readonly VALID_LANGUAGE_MODES = new Set(["auto", "english", "bangla", "banglish"]);

  /** Locks which language the AI always replies in for this business,
   * regardless of what language the customer writes in — "auto" means
   * match the customer's own register instead (the original behavior). */
  setLanguageMode(languageMode: string, businessId: string = PLATFORM_CONFIG_ID) {
    if (!AiConfigController.VALID_LANGUAGE_MODES.has(languageMode)) {
      throw new Error('languageMode must be "auto", "english", "bangla", or "banglish".');
    }

    return this.aiConfig.setLanguageMode(businessId, languageMode);
  }

  /** Appends a rule to the platform default AND every existing client's
   * own current prompt — for policy rules that must apply everywhere
   * immediately, not just to clients who haven't customized their prompt
   * yet (append() alone only reaches whichever single businessId you
   * pass it). Each business gets its own new AiConfigVersion, same as a
   * manual edit — nothing here is a special/hidden write path. */
  async broadcastAppend(additionalText: string, note?: string) {
    if (!additionalText.trim()) {
      throw new Error("Text to add is required.");
    }

    const businesses = await this.tenants.listAll();
    const targets = [PLATFORM_CONFIG_ID, ...businesses.map((b) => b.id)];

    for (const businessId of targets) {
      await this.aiConfig.append(businessId, additionalText, note);
    }

    return { updated: targets.length, businessIds: targets };
  }
}
