import { WidgetConfigService, type WidgetConfigInput } from "@ai-chat-platform/widget-config";

export class WidgetConfigController {
  constructor(private readonly widgetConfig: WidgetConfigService) {}

  get(businessId: string) {
    return this.widgetConfig.get(businessId);
  }

  save(businessId: string, input: WidgetConfigInput) {
    return this.widgetConfig.save(businessId, input);
  }
}
