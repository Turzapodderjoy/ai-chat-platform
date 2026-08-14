import { DashboardThemeService, type ThemeMode } from "@ai-chat-platform/dashboard-theme";

export class DashboardThemeController {
  constructor(private readonly theme: DashboardThemeService) {}

  get() {
    return this.theme.get();
  }

  set(mode: ThemeMode) {
    return this.theme.set(mode);
  }
}
