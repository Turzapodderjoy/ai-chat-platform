import { prisma } from "@ai-chat-platform/database";

export interface AdminNotification {
  id: string;
  businessId: string;
  title: string;
  body: string;
  createdAt: string;
}

/** Admin-authored messages pushed to one business's dashboard -- shows
 * up in that client's topbar notification bell. See AdminNotification's
 * own schema comment for why dismissal is tracked client-side, not here. */
export class AdminNotificationService {
  async listForBusiness(businessId: string): Promise<AdminNotification[]> {
    const rows = await prisma.adminNotification.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return rows.map((r) => ({ id: r.id, businessId: r.businessId, title: r.title, body: r.body, createdAt: r.createdAt.toISOString() }));
  }

  async create(businessId: string, title: string, body: string): Promise<AdminNotification> {
    const row = await prisma.adminNotification.create({ data: { businessId, title, body } });
    return { id: row.id, businessId: row.businessId, title: row.title, body: row.body, createdAt: row.createdAt.toISOString() };
  }

  async delete(id: string): Promise<void> {
    await prisma.adminNotification.delete({ where: { id } });
  }
}
