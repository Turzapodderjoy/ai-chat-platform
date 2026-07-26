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
}