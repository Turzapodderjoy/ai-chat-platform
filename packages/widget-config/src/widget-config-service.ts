import { prisma } from "@ai-chat-platform/database";

export interface WidgetConfig {
  businessId: string;
  accentColor: string;
  position: "bottom-right" | "bottom-left";
  theme: "light" | "dark";
  launcherText: string;
  headerText: string;
  greeting: string;
  avatarUrl: string | null;
  showBranding: boolean;
}

const DEFAULTS: Omit<WidgetConfig, "businessId"> = {
  accentColor: "#8b7cf6",
  position: "bottom-right",
  theme: "light",
  launcherText: "Chat",
  headerText: "Chat with us",
  greeting: "Hi! How can I help you today?",
  avatarUrl: null,
  showBranding: true,
};

export type WidgetConfigInput = Partial<Omit<WidgetConfig, "businessId">>;

export class WidgetConfigService {
  /** Every business gets a usable config even before it ever saves one —
   * the widget script always has something sensible to render. */
  async get(businessId: string): Promise<WidgetConfig> {
    const row = await prisma.widgetConfig.findUnique({ where: { businessId } });
    if (!row) return { businessId, ...DEFAULTS };

    return {
      businessId: row.businessId,
      accentColor: row.accentColor,
      position: row.position === "bottom-left" ? "bottom-left" : "bottom-right",
      theme: row.theme === "dark" ? "dark" : "light",
      launcherText: row.launcherText,
      headerText: row.headerText,
      greeting: row.greeting,
      avatarUrl: row.avatarUrl,
      showBranding: row.showBranding,
    };
  }

  async save(businessId: string, input: WidgetConfigInput): Promise<WidgetConfig> {
    if (input.accentColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(input.accentColor)) {
      throw new Error("accentColor must be a hex color like #2563eb.");
    }

    const row = await prisma.widgetConfig.upsert({
      where: { businessId },
      create: { businessId, ...DEFAULTS, ...input },
      update: { ...input },
    });

    return this.get(row.businessId);
  }
}
