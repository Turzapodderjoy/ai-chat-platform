import { AutoHealService } from "@ai-chat-platform/auto-heal";

export class AutoHealController {
  constructor(private readonly autoHeal: AutoHealService) {}

  run(triggeredBy: "cron" | "manual") {
    return this.autoHeal.run(triggeredBy);
  }
}
