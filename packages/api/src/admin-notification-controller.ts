import { AdminNotificationService } from "@ai-chat-platform/notifications";

export class AdminNotificationController {
  constructor(private readonly notifications: AdminNotificationService) {}

  listForBusiness(businessId: string) {
    return this.notifications.listForBusiness(businessId);
  }

  create(businessId: string, title: string, body: string) {
    return this.notifications.create(businessId, title, body);
  }

  delete(id: string) {
    return this.notifications.delete(id);
  }
}
