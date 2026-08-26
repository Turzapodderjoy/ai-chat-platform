import { prisma } from "@ai-chat-platform/database";

/** Per-business "admin removed this box" list — see HiddenWidget's own
 * schema comment. widgetId is any stable dotted id a dashboard widget
 * owns ("panel.orders", "reports.delivery"); this service doesn't care
 * what it means, only whether it's hidden for a business. */
export class WidgetVisibilityService {
  async listHidden(businessId: string): Promise<string[]> {
    const rows = await prisma.hiddenWidget.findMany({ where: { businessId }, select: { widgetId: true } });
    return rows.map((r) => r.widgetId);
  }

  async hide(businessId: string, widgetId: string): Promise<void> {
    await prisma.hiddenWidget.upsert({
      where: { businessId_widgetId: { businessId, widgetId } },
      create: { businessId, widgetId },
      update: {},
    });
  }

  async show(businessId: string, widgetId: string): Promise<void> {
    await prisma.hiddenWidget.deleteMany({ where: { businessId, widgetId } });
  }
}
