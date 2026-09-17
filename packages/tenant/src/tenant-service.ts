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

  /** Platform-wide (mother dashboard) — every client, scoped to admin-only callers. */
  async listAll() {
    return prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        aiEnabled: true,
        timezone: true,
        createdAt: true,
        subscriptionActive: true,
        subscriptionEndDate: true,
      },
    });
  }

  /** Creates a new client. Its dashboard exists immediately at
   * /dashboard/{id} — that's one dynamic route serving every business,
   * not a page generated per client, so it needs no deploy. */
  async createBusiness(name: string, type: string = "regular") {
    const slug = `${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;

    return prisma.business.create({
      data: { name, slug, type },
    });
  }

  async setBusinessType(id: string, type: string) {
    return prisma.business.update({ where: { id }, data: { type } });
  }

  async setAiEnabled(id: string, aiEnabled: boolean) {
    return prisma.business.update({ where: { id }, data: { aiEnabled } });
  }

  async setTimezone(id: string, timezone: string) {
    // Validate IANA timezone identifier to prevent storing arbitrary strings.
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new Error(`Invalid timezone: "${timezone}". Must be a valid IANA timezone identifier.`);
    }
    return prisma.business.update({ where: { id }, data: { timezone } });
  }

  /** Memberships cascade via the schema; conversations/crawl targets/
   * knowledge chunks are cleaned up separately by the caller (they're
   * plain-string businessId references, not Prisma relations). */
  async deleteBusiness(id: string) {
    const existing = await prisma.business.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new Error("Business not found.");
    return prisma.business.delete({ where: { id } });
  }
}