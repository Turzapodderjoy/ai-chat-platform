import { prisma } from "@ai-chat-platform/database";

export type ThemeMode = "dark" | "light";

const SINGLETON_ID = "singleton";

/** One shared theme for every dashboard viewer — deliberately not
 * per-browser localStorage, so the toggle is "universal for all users"
 * as requested, not a personal setting each operator sees differently. */
export class DashboardThemeService {
  async get(): Promise<ThemeMode> {
    const row = await prisma.dashboardTheme.findUnique({ where: { id: SINGLETON_ID } });
    return row?.mode === "light" ? "light" : "dark";
  }

  async set(mode: ThemeMode): Promise<ThemeMode> {
    const row = await prisma.dashboardTheme.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, mode },
      update: { mode },
    });
    return row.mode === "light" ? "light" : "dark";
  }
}
