import { prisma } from "@ai-chat-platform/database";

import { TagService } from "./tag-service";

export interface AnalyticsFilters {
  businessId: string;
  from?: string;
  to?: string;
  tagIds?: string[];
  channel?: string;
}

export interface TagCount {
  tagId: string;
  label: string;
  color: string | null;
  count: number;
  pctOfTotal: number;
  channelBreakdown: Record<string, number>;
}

export interface FunnelStage {
  tagId: string;
  label: string;
  count: number;
  conversionFromPrevious: number | null;
}

export interface FunnelVelocity {
  fromLabel: string;
  toLabel: string;
  avgDays: number | null;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface AnalyticsResult {
  totalTaggedConversations: number;
  totalTaggedConversationsDeltaPct: number | null;
  conversionRate: number | null;
  conversionRateDeltaPct: number | null;
  topTag: { label: string; count: number } | null;
  tagCounts: TagCount[];
  funnel: FunnelStage[];
  funnelVelocity: FunnelVelocity[];
  trend: TrendPoint[];
}

const DEFAULT_RANGE_DAYS = 30;
const CHANNELS = ["website", "messenger", "instagram", "whatsapp"];

type TaggedRow = {
  conversationId: string;
  tagId: string;
  label: string;
  color: string | null;
  channel: string;
  createdAt: Date; // tag-assignment time — the timestamp trend/velocity use, per the plan's explicit rule
};

/** All numbers here are computed live from ConversationTag rows at
 * request time — no denormalized counters to drift out of sync (see
 * plan's "Analytics accuracy" section). Every count is a count of
 * DISTINCT conversationIds, never raw rows, which is what makes a tag
 * applied twice in one chat still count once. */
export class AnalyticsService {
  constructor(private readonly tags: TagService) {}

  async getAnalytics(filters: AnalyticsFilters): Promise<AnalyticsResult> {
    const { from, to } = resolveRange(filters.from, filters.to);
    const rangeMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - rangeMs);
    const prevTo = from;

    const [current, previous, funnelStages] = await Promise.all([
      this.fetchRows({ ...filters, from, to }),
      this.fetchRows({ ...filters, from: prevFrom, to: prevTo }),
      this.tags.funnelStages(filters.businessId),
    ]);

    const totalTaggedConversations = distinctConversationCount(current);
    const totalPrev = distinctConversationCount(previous);

    const tagCounts = buildTagCounts(current, totalTaggedConversations);
    const topTag = tagCounts[0] ? { label: tagCounts[0].label, count: tagCounts[0].count } : null;

    const funnel = buildFunnel(funnelStages, current);
    const funnelPrev = buildFunnel(funnelStages, previous);

    const conversionRate = overallConversionRate(funnel);
    const conversionRatePrev = overallConversionRate(funnelPrev);

    const funnelVelocity = buildFunnelVelocity(funnelStages, current);
    const trend = buildTrend(current, from, to, filters.tagIds);

    return {
      totalTaggedConversations,
      totalTaggedConversationsDeltaPct: pctDelta(totalTaggedConversations, totalPrev),
      conversionRate,
      conversionRateDeltaPct: pctDelta(conversionRate, conversionRatePrev),
      topTag,
      tagCounts,
      funnel,
      funnelVelocity,
      trend,
    };
  }

  private async fetchRows(filters: { businessId: string; from: Date; to: Date; tagIds?: string[]; channel?: string }): Promise<TaggedRow[]> {
    const rows = await prisma.conversationTag.findMany({
      where: {
        createdAt: { gte: filters.from, lte: filters.to },
        ...(filters.tagIds && filters.tagIds.length > 0 ? { tagId: { in: filters.tagIds } } : {}),
        conversation: {
          businessId: filters.businessId,
          ...(filters.channel ? { channel: filters.channel } : {}),
        },
      },
      include: {
        tag: { select: { label: true, color: true } },
        conversation: { select: { channel: true } },
      },
    });

    return rows.map((r) => ({
      conversationId: r.conversationId,
      tagId: r.tagId,
      label: r.tag.label,
      color: r.tag.color,
      channel: r.conversation.channel,
      createdAt: r.createdAt,
    }));
  }

  /** Custom pivot table — group by any combination of the fixed dimension
   * set, count distinct conversations (or messages) per group. Fetches
   * the filtered rows with their joined fields, then aggregates in JS —
   * mirrors the same brute-force-in-application-code precedent already
   * used by VectorRecord search, since Prisma's groupBy can't group
   * across a joined relation (tag -> conversation's channel) in one call. */
  async getPivot(params: {
    businessId: string;
    dimensions: string[];
    measure: "conversationCount" | "messageCount";
    from?: string;
    to?: string;
    tagIds?: string[];
    channel?: string;
  }): Promise<{ rows: Array<Record<string, string | number>>; total: number }> {
    const { from, to } = resolveRange(params.from, params.to);

    if (params.measure === "messageCount") {
      const rows = await prisma.messageTag.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          ...(params.tagIds && params.tagIds.length > 0 ? { tagId: { in: params.tagIds } } : {}),
          message: {
            conversation: {
              businessId: params.businessId,
              ...(params.channel ? { channel: params.channel } : {}),
            },
          },
        },
        include: {
          tag: { select: { label: true } },
          message: { select: { conversation: { select: { channel: true, handoffStatus: true } } } },
        },
      });

      const enriched = rows.map((r) => ({
        id: r.messageId,
        label: r.tag.label,
        channel: r.message.conversation.channel,
        handoffStatus: r.message.conversation.handoffStatus,
        source: r.source,
        createdAt: r.createdAt,
      }));

      return pivotAggregate(enriched, params.dimensions);
    }

    const rows = await prisma.conversationTag.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(params.tagIds && params.tagIds.length > 0 ? { tagId: { in: params.tagIds } } : {}),
        conversation: {
          businessId: params.businessId,
          ...(params.channel ? { channel: params.channel } : {}),
        },
      },
      include: {
        tag: { select: { label: true } },
        conversation: { select: { channel: true, handoffStatus: true } },
      },
    });

    const enriched = rows.map((r) => ({
      id: r.conversationId,
      label: r.tag.label,
      channel: r.conversation.channel,
      handoffStatus: r.conversation.handoffStatus,
      source: r.source,
      createdAt: r.createdAt,
    }));

    return pivotAggregate(enriched, params.dimensions);
  }
}

const MAX_RANGE_DAYS = 366;

// A plain "YYYY-MM-DD" date (no time component) from the filter bar's
// <input type="date"> parses to midnight UTC — used as-is for `to`, that
// silently excludes every event from later the same day. Bump a
// date-only `to` to the end of that day so "to: today" actually means
// "through the end of today."
function endOfDayIfDateOnly(dateStr: string): Date {
  const parsed = new Date(dateStr);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed;
}

function resolveRange(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? endOfDayIfDateOnly(to) : new Date();
  let fromDate = from ? new Date(from) : new Date(toDate.getTime() - DEFAULT_RANGE_DAYS * 86_400_000);

  // Cap how wide a range can be — prevents an absurd or malformed range
  // (e.g. a copy-paste typo, or the unbounded pivot/trend zero-fill)
  // from generating an enormous response.
  const maxSpanMs = MAX_RANGE_DAYS * 86_400_000;
  if (toDate.getTime() - fromDate.getTime() > maxSpanMs) {
    fromDate = new Date(toDate.getTime() - maxSpanMs);
  }

  return { from: fromDate, to: toDate };
}

function distinctConversationCount(rows: TaggedRow[]): number {
  return new Set(rows.map((r) => r.conversationId)).size;
}

function pctDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function buildTagCounts(rows: TaggedRow[], total: number): TagCount[] {
  const byTag = new Map<string, { label: string; color: string | null; conversationIds: Set<string>; channelCounts: Map<string, number> }>();

  for (const r of rows) {
    let entry = byTag.get(r.tagId);
    if (!entry) {
      entry = { label: r.label, color: r.color, conversationIds: new Set(), channelCounts: new Map() };
      byTag.set(r.tagId, entry);
    }
    entry.conversationIds.add(r.conversationId);
    entry.channelCounts.set(r.channel, (entry.channelCounts.get(r.channel) ?? 0) + 1);
  }

  return [...byTag.entries()]
    .map(([tagId, e]) => ({
      tagId,
      label: e.label,
      color: e.color,
      count: e.conversationIds.size,
      pctOfTotal: total > 0 ? (e.conversationIds.size / total) * 100 : 0,
      channelBreakdown: Object.fromEntries(CHANNELS.map((c) => [c, e.channelCounts.get(c) ?? 0])),
    }))
    .sort((a, b) => b.count - a.count);
}

function buildFunnel(
  stages: { id: string; label: string }[],
  rows: TaggedRow[]
): FunnelStage[] {
  const countByTag = new Map<string, number>();
  for (const stage of stages) {
    countByTag.set(stage.id, new Set(rows.filter((r) => r.tagId === stage.id).map((r) => r.conversationId)).size);
  }

  return stages.map((stage, i) => {
    const count = countByTag.get(stage.id) ?? 0;
    const prevCount = i > 0 ? countByTag.get(stages[i - 1]!.id) ?? 0 : null;
    return {
      tagId: stage.id,
      label: stage.label,
      count,
      conversionFromPrevious: prevCount !== null && prevCount > 0 ? (count / prevCount) * 100 : null,
    };
  });
}

function overallConversionRate(funnel: FunnelStage[]): number | null {
  if (funnel.length < 2) return null;
  const first = funnel[0]!.count;
  const last = funnel[funnel.length - 1]!.count;
  return first > 0 ? (last / first) * 100 : null;
}

function buildFunnelVelocity(
  stages: { id: string; label: string }[],
  rows: TaggedRow[]
): FunnelVelocity[] {
  const timeByConversationAndTag = new Map<string, Map<string, Date>>();
  for (const r of rows) {
    let m = timeByConversationAndTag.get(r.conversationId);
    if (!m) {
      m = new Map();
      timeByConversationAndTag.set(r.conversationId, m);
    }
    // A conversation could theoretically get the same stage tag applied
    // twice if the AI and a human both apply it — the unique constraint
    // prevents that at the DB level, so there's at most one timestamp.
    m.set(r.tagId, r.createdAt);
  }

  const velocities: FunnelVelocity[] = [];
  for (let i = 1; i < stages.length; i++) {
    const from = stages[i - 1]!;
    const to = stages[i]!;
    const diffs: number[] = [];

    for (const tagTimes of timeByConversationAndTag.values()) {
      const fromTime = tagTimes.get(from.id);
      const toTime = tagTimes.get(to.id);
      if (fromTime && toTime && toTime >= fromTime) {
        diffs.push((toTime.getTime() - fromTime.getTime()) / 86_400_000);
      }
    }

    velocities.push({
      fromLabel: from.label,
      toLabel: to.label,
      avgDays: diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null,
    });
  }

  return velocities;
}

function buildTrend(rows: TaggedRow[], from: Date, to: Date, tagIds?: string[]): TrendPoint[] {
  const relevant = tagIds && tagIds.length > 0 ? rows.filter((r) => tagIds.includes(r.tagId)) : rows;

  const countByDay = new Map<string, Set<string>>();
  for (const r of relevant) {
    const day = r.createdAt.toISOString().slice(0, 10);
    let set = countByDay.get(day);
    if (!set) {
      set = new Set();
      countByDay.set(day, set);
    }
    set.add(r.conversationId);
  }

  // Zero-fill every day in range so the line chart doesn't silently skip
  // gaps — a missing bucket would otherwise misleadingly interpolate.
  const points: TrendPoint[] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    const day = cursor.toISOString().slice(0, 10);
    points.push({ date: day, count: countByDay.get(day)?.size ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return points;
}

function dateBucket(d: Date, granularity: "date_day" | "date_week" | "date_month"): string {
  if (granularity === "date_month") return d.toISOString().slice(0, 7);
  if (granularity === "date_day") return d.toISOString().slice(0, 10);

  // ISO week bucket: Monday of that week, as YYYY-MM-DD.
  const monday = new Date(d);
  const day = monday.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function pivotAggregate(
  rows: Array<{ id: string; label: string; channel: string; handoffStatus: string; source: string; createdAt: Date }>,
  dimensions: string[]
): { rows: Array<Record<string, string | number>>; total: number } {
  const groups = new Map<string, { key: Record<string, string>; ids: Set<string> }>();

  for (const r of rows) {
    const keyParts: Record<string, string> = {};
    for (const dim of dimensions) {
      if (dim === "tag") keyParts.tag = r.label;
      else if (dim === "channel") keyParts.channel = r.channel;
      else if (dim === "handoffStatus") keyParts.handoffStatus = r.handoffStatus;
      else if (dim === "source") keyParts.source = r.source;
      else if (dim === "date_day" || dim === "date_week" || dim === "date_month") keyParts[dim] = dateBucket(r.createdAt, dim);
    }

    const key = JSON.stringify(keyParts);
    let group = groups.get(key);
    if (!group) {
      group = { key: keyParts, ids: new Set() };
      groups.set(key, group);
    }
    group.ids.add(r.id);
  }

  const resultRows = [...groups.values()]
    .map((g) => ({ ...g.key, count: g.ids.size }))
    .sort((a, b) => (b.count as number) - (a.count as number));

  return { rows: resultRows, total: new Set(rows.map((r) => r.id)).size };
}
