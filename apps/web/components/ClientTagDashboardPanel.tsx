"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from "recharts";

import { StatCard, StatCardRow, type StatTone } from "./StatCard";
import { showConfirm } from "../lib/app-dialog";

interface Tag {
  id: string;
  label: string;
  color: string | null;
  businessId: string;
  isFunnelStage: boolean;
  funnelOrder: number | null;
}

interface TagCount {
  tagId: string;
  label: string;
  color: string | null;
  count: number;
  pctOfTotal: number;
  channelBreakdown: Record<string, number>;
}

interface FunnelStage {
  tagId: string;
  label: string;
  count: number;
  conversionFromPrevious: number | null;
}

interface FunnelVelocity {
  fromLabel: string;
  toLabel: string;
  avgDays: number | null;
}

interface AnalyticsResult {
  totalTaggedConversations: number;
  totalTaggedConversationsDeltaPct: number | null;
  conversionRate: number | null;
  conversionRateDeltaPct: number | null;
  topTag: { label: string; count: number } | null;
  tagCounts: TagCount[];
  funnel: FunnelStage[];
  funnelVelocity: FunnelVelocity[];
  trend: { date: string; count: number }[];
}

const CHANNELS = [
  { value: "", label: "All channels" },
  { value: "website", label: "Website" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
];

const PIVOT_DIMENSIONS = [
  { value: "tag", label: "Tag" },
  { value: "channel", label: "Channel" },
  { value: "date_day", label: "Date (day)" },
  { value: "date_week", label: "Date (week)" },
  { value: "date_month", label: "Date (month)" },
  { value: "handoffStatus", label: "Handoff status" },
  { value: "source", label: "Tag source" },
];

function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtPct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

function fmtDelta(n: number | null): string | undefined {
  if (n === null) return undefined;
  return `${n >= 0 ? "up" : "down"} ${Math.abs(n).toFixed(1)}% vs previous period`;
}

function deltaTone(n: number | null): StatTone {
  if (n === null) return "neutral";
  return n >= 0 ? "success" : "danger";
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Intercom-style per-client analytics dashboard — filter bar drives
 * every chart/table below it together, funnel-stage tags (mother- or
 * client-defined) automatically produce a HubSpot-style conversion
 * funnel, and a custom pivot table lets the client build their own
 * ad-hoc breakdowns. See packages/tagging-pipeline/src/analytics-service.ts
 * for the exact accuracy rules (dedup, conversion formula, timestamps)
 * every number here follows. */
export function ClientTagDashboardPanel({ businessId }: { businessId: string }) {
  const [range, setRange] = useState(defaultRange());
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState("");

  const [tags, setTags] = useState<Tag[] | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null);

  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3fb950");

  const [pivotDims, setPivotDims] = useState<string[]>(["tag"]);
  const [pivotMeasure, setPivotMeasure] = useState<"conversationCount" | "messageCount">("conversationCount");
  const [pivotResult, setPivotResult] = useState<{ rows: Record<string, string | number>[]; total: number } | null>(null);
  const [pivotLoading, setPivotLoading] = useState(false);

  function refreshTags() {
    fetch(`/api/admin/tags?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d) => setTags(d.tags));
  }

  function refreshAnalytics() {
    const qs = new URLSearchParams({ businessId, from: range.from, to: range.to });
    if (tagFilter.length > 0) qs.set("tagIds", tagFilter.join(","));
    if (channelFilter) qs.set("channel", channelFilter);

    fetch(`/api/admin/tags/analytics?${qs.toString()}`)
      .then((r) => r.json())
      .then(setAnalytics);
  }

  useEffect(refreshTags, [businessId]);
  useEffect(refreshAnalytics, [businessId, range.from, range.to, tagFilter, channelFilter]);

  async function runPivot() {
    setPivotLoading(true);
    try {
      const res = await fetch("/api/admin/tags/pivot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          dimensions: pivotDims,
          measure: pivotMeasure,
          from: range.from,
          to: range.to,
          tagIds: tagFilter.length > 0 ? tagFilter : undefined,
          channel: channelFilter || undefined,
        }),
      });
      setPivotResult(await res.json());
    } finally {
      setPivotLoading(false);
    }
  }

  // Re-run the pivot whenever its own controls or the shared filter bar
  // change, so it never shows stale numbers from a previous filter set.
  useEffect(() => {
    if (pivotDims.length > 0) runPivot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotDims, pivotMeasure, businessId, range.from, range.to, tagFilter, channelFilter]);

  async function addMyTag() {
    if (!newTagLabel.trim()) return;
    await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, label: newTagLabel, color: newTagColor }),
    });
    setNewTagLabel("");
    refreshTags();
  }

  async function deleteMyTag(tag: Tag) {
    const confirmed = await showConfirm(`Delete "${tag.label}"? This removes it from every conversation it's applied to.`);
    if (!confirmed) return;
    await fetch(`/api/admin/tags?id=${encodeURIComponent(tag.id)}`, { method: "DELETE" });
    setTags((prev) => prev?.filter((t) => t.id !== tag.id) ?? prev);
  }

  const myTags = useMemo(() => (tags ?? []).filter((t) => t.businessId === businessId), [tags, businessId]);

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Tag dashboard</span>
        <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {range.from} to {range.to}
        </span>
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 14, maxWidth: "68ch" }}>
          Tag-based reporting for this business — every number recomputed live from actual tag
          assignments, never a stale running total. A tag used twice in one chat still counts once.
        </p>

        <div className="toolbar" style={{ marginBottom: 20, alignItems: "flex-end" }}>
          <div className="field">
            <label className="field-label" htmlFor="aiva-tags-from">From</label>
            <input
              id="aiva-tags-from"
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="aiva-tags-to">To</label>
            <input
              id="aiva-tags-to"
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label className="field-label" htmlFor="aiva-tags-channel">Channel</label>
            <select id="aiva-tags-channel" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 190 }}>
            <label className="field-label" htmlFor="aiva-tags-filter">Tags</label>
            <select
              id="aiva-tags-filter"
              multiple
              value={tagFilter}
              onChange={(e) => setTagFilter(Array.from(e.target.selectedOptions, (o) => o.value))}
              style={{ minHeight: 62 }}
            >
              {(tags ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          {tagFilter.length > 0 && (
            <button onClick={() => setTagFilter([])} className="ghost sm">Clear tag filter</button>
          )}
        </div>

        {!analytics && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="skeleton" style={{ height: 72 }} />
            <div className="skeleton" style={{ height: 220 }} />
          </div>
        )}

        {analytics && (
          <>
            <StatCardRow>
              <StatCard
                label="Total tagged conversations"
                value={String(analytics.totalTaggedConversations)}
                hint={fmtDelta(analytics.totalTaggedConversationsDeltaPct)}
                tone={deltaTone(analytics.totalTaggedConversationsDeltaPct)}
              />
              <StatCard
                label="Conversion rate"
                value={fmtPct(analytics.conversionRate)}
                hint={fmtDelta(analytics.conversionRateDeltaPct)}
                tone={deltaTone(analytics.conversionRateDeltaPct)}
              />
              <StatCard
                label="Top tag"
                value={analytics.topTag ? analytics.topTag.label : "—"}
                hint={analytics.topTag ? `${analytics.topTag.count} conversations` : undefined}
              />
            </StatCardRow>

            {analytics.funnel.length > 0 && (
              <div className="panel-sunk" style={{ padding: 14, marginBottom: 16 }}>
                <div className="panel-head" style={{ marginBottom: 10 }}>
                  <span className="instrument-label">Funnel</span>
                  <button
                    onClick={() => downloadCsv("funnel.csv", analytics.funnel.map((f) => ({ stage: f.label, count: f.count, conversionFromPrevious: f.conversionFromPrevious ?? "" })))}
                    className="ghost sm"
                  >
                    Download CSV
                  </button>
                </div>

                <div style={{ color: "var(--accent)" }}>
                  <ResponsiveContainer width="100%" height={Math.max(120, analytics.funnel.length * 50)}>
                    <BarChart data={analytics.funnel} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="label" width={120} />
                      <Tooltip formatter={(value: number, name: string) => [value, name]} />
                      <Bar dataKey="count" fill="currentColor" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  {analytics.funnel.map((f, i) =>
                    i > 0 ? (
                      <div key={f.tagId} className="data" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                        {f.label}: {fmtPct(f.conversionFromPrevious)} conversion from previous stage
                      </div>
                    ) : null,
                  )}
                </div>

                {analytics.funnelVelocity.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                    {analytics.funnelVelocity.map((v) => (
                      <div
                        key={`${v.fromLabel}-${v.toLabel}`}
                        className="data"
                        style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                      >
                        {v.fromLabel} → {v.toLabel}: avg {v.avgDays !== null ? `${v.avgDays.toFixed(1)} days` : "—"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="panel-sunk" style={{ padding: 14, marginBottom: 16 }}>
              <div className="panel-head" style={{ marginBottom: 10 }}>
                <span className="instrument-label">Trend</span>
                <button
                  onClick={() => downloadCsv("trend.csv", analytics.trend.map((t) => ({ date: t.date, count: t.count })))}
                  className="ghost sm"
                >
                  Download CSV
                </button>
              </div>

              <div style={{ color: "var(--machine)" }}>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={analytics.trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" name="Tagged conversations" stroke="currentColor" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel-sunk" style={{ padding: 14, marginBottom: 16 }}>
              <div className="panel-head" style={{ marginBottom: 10 }}>
                <span className="instrument-label">Tags</span>
                <button
                  onClick={() =>
                    downloadCsv(
                      "tags.csv",
                      analytics.tagCounts.map((t) => ({
                        tag: t.label,
                        count: t.count,
                        pctOfTotal: t.pctOfTotal.toFixed(1),
                        website: t.channelBreakdown.website ?? 0,
                        messenger: t.channelBreakdown.messenger ?? 0,
                        instagram: t.channelBreakdown.instagram ?? 0,
                        whatsapp: t.channelBreakdown.whatsapp ?? 0,
                      }))
                    )
                  }
                  className="ghost sm"
                >
                  Download CSV
                </button>
              </div>

              {analytics.tagCounts.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-title">No tagged conversations in this range</div>
                  <div className="empty-state-description">
                    Widen the date range or clear the tag filter to see tag performance.
                  </div>
                </div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Tag</th>
                        <th className="num">Count</th>
                        <th className="num">% of total</th>
                        <th className="num">Website</th>
                        <th className="num">Messenger</th>
                        <th className="num">Instagram</th>
                        <th className="num">WhatsApp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.tagCounts.map((t) => (
                        <tr key={t.tagId}>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                width: 10,
                                height: 10,
                                borderRadius: 999,
                                background: t.color ?? "var(--ink-4)",
                                marginRight: 8,
                              }}
                            />
                            {t.label}
                          </td>
                          <td className="num data">{t.count}</td>
                          <td className="num data">{t.pctOfTotal.toFixed(1)}%</td>
                          <td className="num data">{t.channelBreakdown.website ?? 0}</td>
                          <td className="num data">{t.channelBreakdown.messenger ?? 0}</td>
                          <td className="num data">{t.channelBreakdown.instagram ?? 0}</td>
                          <td className="num data">{t.channelBreakdown.whatsapp ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        <div className="panel-sunk" style={{ padding: 14, marginBottom: 16 }}>
          <div className="panel-head" style={{ marginBottom: 10 }}>
            <span className="instrument-label">Custom pivot table</span>
            {pivotResult && (
              <button onClick={() => downloadCsv("pivot.csv", pivotResult.rows)} className="ghost sm">
                Download CSV
              </button>
            )}
          </div>
          <p className="meta" style={{ marginTop: 0 }}>
            Pick any combination of dimensions and a measure — recomputes live, like a pivot table.
          </p>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
            <div className="field" style={{ gap: 7 }}>
              <span className="field-label">Dimensions</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {PIVOT_DIMENSIONS.map((d) => (
                  <label key={d.value} style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 5 }}>
                    <input
                      type="checkbox"
                      checked={pivotDims.includes(d.value)}
                      onChange={(e) =>
                        setPivotDims((prev) => (e.target.checked ? [...prev, d.value] : prev.filter((x) => x !== d.value)))
                      }
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="field" style={{ minWidth: 180 }}>
              <label className="field-label" htmlFor="aiva-pivot-measure">Measure</label>
              <select
                id="aiva-pivot-measure"
                value={pivotMeasure}
                onChange={(e) => setPivotMeasure(e.target.value as typeof pivotMeasure)}
              >
                <option value="conversationCount">Conversation count</option>
                <option value="messageCount">Message count</option>
              </select>
            </div>
          </div>

          {pivotLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="skeleton" style={{ height: 32 }} />
              <div className="skeleton" style={{ height: 32 }} />
            </div>
          )}

          {!pivotLoading && pivotResult && pivotResult.rows.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-title">No data for this combination</div>
              <div className="empty-state-description">
                Pick at least one dimension that has values in the selected date range.
              </div>
            </div>
          )}

          {!pivotLoading && pivotResult && pivotResult.rows.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {pivotDims.map((d) => (
                      <th key={d}>{PIVOT_DIMENSIONS.find((p) => p.value === d)?.label ?? d}</th>
                    ))}
                    <th className="num">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {pivotResult.rows.map((row, i) => (
                    <tr key={i}>
                      {pivotDims.map((d) => (
                        <td key={d} className="data">{row[d]}</td>
                      ))}
                      <td className="num data">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel-sunk" style={{ padding: 14 }}>
          <div className="panel-head" style={{ marginBottom: 10 }}>
            <span className="instrument-label">My tags</span>
            <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {myTags.length} tags
            </span>
          </div>
          <p className="meta" style={{ marginTop: 0 }}>
            Private to your business — the platform team can&apos;t see or edit these, and other
            clients never see them.
          </p>

          <div className="toolbar" style={{ marginBottom: 12, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label className="field-label" htmlFor="aiva-new-tag-label">Tag label</label>
              <input
                id="aiva-new-tag-label"
                value={newTagLabel}
                onChange={(e) => setNewTagLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addMyTag();
                }}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="aiva-new-tag-color">Colour</label>
              <input
                id="aiva-new-tag-color"
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                style={{ width: 46, padding: 2 }}
              />
            </div>
            <button onClick={addMyTag} className="primary sm">New tag</button>
          </div>

          {myTags.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No private tags yet</div>
              <div className="empty-state-description">
                Create a tag to label your own conversations — they show up in the filters and tables
                above.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {myTags.map((t) => (
                <span
                  key={t.id}
                  className="panel-sunk"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 6px 5px 10px",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: t.color ?? "var(--ink-4)",
                    }}
                  />
                  <span style={{ fontSize: 13 }}>{t.label}</span>
                  <button
                    onClick={() => deleteMyTag(t)}
                    className="plain sm"
                    aria-label={`Delete tag ${t.label}`}
                  >
                    Remove
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
