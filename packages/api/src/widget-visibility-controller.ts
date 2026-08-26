import { WidgetVisibilityService } from "@ai-chat-platform/widget-visibility";

export class WidgetVisibilityController {
  constructor(private readonly visibility: WidgetVisibilityService) {}

  listHidden(businessId: string) {
    return this.visibility.listHidden(businessId);
  }

  hide(businessId: string, widgetId: string) {
    return this.visibility.hide(businessId, widgetId);
  }

  show(businessId: string, widgetId: string) {
    return this.visibility.show(businessId, widgetId);
  }
}
