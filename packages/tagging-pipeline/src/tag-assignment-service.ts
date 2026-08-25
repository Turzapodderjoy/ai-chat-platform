import { prisma } from "@ai-chat-platform/database";

export interface TagAssignment {
  tagId: string;
  label: string;
  color: string | null;
  source: string;
  createdAt: string;
}

/** Applies/removes tags on conversations and messages — separate from
 * TagService (the catalog CRUD) the same way ChatAnalysisPipeline is
 * separate from ChatAnalysisService: this is "what tags does THIS
 * conversation/message have," not "what tags exist." */
export class TagAssignmentService {
  async conversationTags(conversationId: string): Promise<TagAssignment[]> {
    const rows = await prisma.conversationTag.findMany({
      where: { conversationId },
      include: { tag: true },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((r) => ({
      tagId: r.tagId,
      label: r.tag.label,
      color: r.tag.color,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async conversationTagsForMany(conversationIds: string[]): Promise<Map<string, TagAssignment[]>> {
    if (conversationIds.length === 0) return new Map();

    const rows = await prisma.conversationTag.findMany({
      where: { conversationId: { in: conversationIds } },
      include: { tag: true },
      orderBy: { createdAt: "asc" },
    });

    const map = new Map<string, TagAssignment[]>();
    for (const r of rows) {
      const list = map.get(r.conversationId) ?? [];
      list.push({ tagId: r.tagId, label: r.tag.label, color: r.tag.color, source: r.source, createdAt: r.createdAt.toISOString() });
      map.set(r.conversationId, list);
    }
    return map;
  }

  async messageTagsForMany(messageIds: string[]): Promise<Map<string, TagAssignment[]>> {
    if (messageIds.length === 0) return new Map();

    const rows = await prisma.messageTag.findMany({
      where: { messageId: { in: messageIds } },
      include: { tag: true },
      orderBy: { createdAt: "asc" },
    });

    const map = new Map<string, TagAssignment[]>();
    for (const r of rows) {
      const list = map.get(r.messageId) ?? [];
      list.push({ tagId: r.tagId, label: r.tag.label, color: r.tag.color, source: r.source, createdAt: r.createdAt.toISOString() });
      map.set(r.messageId, list);
    }
    return map;
  }

  /** From either dashboard's inline "+ tag" / hover control — tags only
   * ever get applied by hand, there is no AI auto-tagging. skipDuplicates
   * makes re-adding an already-applied tag a harmless no-op instead of a
   * unique-constraint error. */
  async assignConversationTag(conversationId: string, tagId: string): Promise<void> {
    await prisma.conversationTag.createMany({
      data: [{ conversationId, tagId, source: "manual" }],
      skipDuplicates: true,
    });
  }

  async removeConversationTag(conversationId: string, tagId: string): Promise<void> {
    await prisma.conversationTag.deleteMany({ where: { conversationId, tagId } });
  }

  async assignMessageTag(messageId: string, tagId: string): Promise<void> {
    await prisma.messageTag.createMany({
      data: [{ messageId, tagId, source: "manual" }],
      skipDuplicates: true,
    });
  }

  async removeMessageTag(messageId: string, tagId: string): Promise<void> {
    await prisma.messageTag.deleteMany({ where: { messageId, tagId } });
  }

  async orderTagsForMany(orderIds: string[]): Promise<Map<string, TagAssignment[]>> {
    if (orderIds.length === 0) return new Map();

    const rows = await prisma.orderTag.findMany({
      where: { orderId: { in: orderIds } },
      include: { tag: true },
      orderBy: { createdAt: "asc" },
    });

    const map = new Map<string, TagAssignment[]>();
    for (const r of rows) {
      const list = map.get(r.orderId) ?? [];
      list.push({ tagId: r.tagId, label: r.tag.label, color: r.tag.color, source: r.source, createdAt: r.createdAt.toISOString() });
      map.set(r.orderId, list);
    }
    return map;
  }

  async assignOrderTag(orderId: string, tagId: string): Promise<void> {
    await prisma.orderTag.createMany({
      data: [{ orderId, tagId, source: "manual" }],
      skipDuplicates: true,
    });
  }

  async removeOrderTag(orderId: string, tagId: string): Promise<void> {
    await prisma.orderTag.deleteMany({ where: { orderId, tagId } });
  }
}
