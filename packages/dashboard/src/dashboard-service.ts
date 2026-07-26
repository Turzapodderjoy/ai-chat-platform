import { prisma } from "@ai-chat-platform/database";

import type { DashboardStats } from "./types";

export class DashboardService {
  async stats(): Promise<DashboardStats> {
    const [
      users,
      businesses,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.business.count(),
    ]);

    return {
      users,
      businesses,
      documents: 0,
      messages: 0,
    };
  }
}