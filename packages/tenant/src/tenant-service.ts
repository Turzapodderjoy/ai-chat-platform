import { prisma } from "@ai-chat-platform/database";

export class TenantService {
  async getMembership(userId: string) {
    return prisma.membership.findFirst({
      where: {
        userId,
      },
      include: {
        business: true,
      },
    });
  }

  async listBusinesses(userId: string) {
    return prisma.membership.findMany({
      where: {
        userId,
      },
      include: {
        business: true,
      },
    });
  }

  async getBusiness(businessId: string) {
    return prisma.business.findUnique({
      where: {
        id: businessId,
      },
    });
  }

  /** Platform-wide (mother dashboard) — every client, not scoped to a user.
   * No auth check here since there's no login wall yet; add one when
   * the dashboard is gated behind auth. */
  async listAll() {
    return prisma.business.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  /** Creates a new client. Its dashboard exists immediately at
   * /dashboard/{id} — that's one dynamic route serving every business,
   * not a page generated per client, so it needs no deploy. */
  async createBusiness(name: string) {
    const slug = `${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;

    return prisma.business.create({
      data: { name, slug },
    });
  }

  /** Memberships cascade via the schema; conversations/crawl targets/
   * knowledge chunks are cleaned up separately by the caller (they're
   * plain-string businessId references, not Prisma relations). */
  async deleteBusiness(id: string) {
    return prisma.business.delete({ where: { id } });
  }
}