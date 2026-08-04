import { prisma } from "@ai-chat-platform/database";
import { PLATFORM_CONFIG_ID } from "@ai-chat-platform/ai-config";

export { PLATFORM_CONFIG_ID };

export interface TagRecord {
  id: string;
  label: string;
  color: string | null;
  businessId: string;
  isFunnelStage: boolean;
  funnelOrder: number | null;
  createdAt: string;
}

type Row = {
  id: string;
  label: string;
  color: string | null;
  businessId: string;
  isFunnelStage: boolean;
  funnelOrder: number | null;
  createdAt: Date;
};

function toTag(row: Row): TagRecord {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    businessId: row.businessId,
    isFunnelStage: row.isFunnelStage,
    funnelOrder: row.funnelOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Plain CRUD over the Tag catalog. A platform tag (businessId =
 * "__platform__") is visible to and usable by every client; a client tag
 * is private to that one business. listTags() always merges both — a
 * client never sees another client's private tags, and the mother
 * dashboard's calls (businessId omitted) only ever see the platform set. */
export class TagService {
  async listTags(businessId?: string): Promise<TagRecord[]> {
    const rows = await prisma.tag.findMany({
      where:
        businessId && businessId !== PLATFORM_CONFIG_ID
          ? { businessId: { in: [PLATFORM_CONFIG_ID, businessId] } }
          : { businessId: PLATFORM_CONFIG_ID },
      orderBy: [{ isFunnelStage: "desc" }, { funnelOrder: "asc" }, { label: "asc" }],
    });

    return rows.map(toTag);
  }

  async createTag(params: {
    businessId?: string;
    label: string;
    color?: string | null;
    isFunnelStage?: boolean;
    funnelOrder?: number | null;
  }): Promise<TagRecord> {
    const created = await prisma.tag.create({
      data: {
        businessId: params.businessId ?? PLATFORM_CONFIG_ID,
        label: params.label.trim(),
        color: params.color ?? null,
        isFunnelStage: params.isFunnelStage ?? false,
        funnelOrder: params.isFunnelStage ? (params.funnelOrder ?? null) : null,
      },
    });

    return toTag(created);
  }

  async updateTag(
    id: string,
    patch: { label?: string; color?: string | null; isFunnelStage?: boolean; funnelOrder?: number | null }
  ): Promise<TagRecord> {
    const updated = await prisma.tag.update({
      where: { id },
      data: {
        ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.isFunnelStage !== undefined ? { isFunnelStage: patch.isFunnelStage } : {}),
        ...(patch.funnelOrder !== undefined ? { funnelOrder: patch.funnelOrder } : {}),
      },
    });

    return toTag(updated);
  }

  async deleteTag(id: string): Promise<void> {
    await prisma.tag.delete({ where: { id } });
  }

  /** Ordered funnel-stage tags for a business (platform + that client's
   * own), used by both the analytics service and the tagging pipeline's
   * candidate list. */
  async funnelStages(businessId?: string): Promise<TagRecord[]> {
    const tags = await this.listTags(businessId);
    return tags.filter((t) => t.isFunnelStage).sort((a, b) => (a.funnelOrder ?? 0) - (b.funnelOrder ?? 0));
  }
}
