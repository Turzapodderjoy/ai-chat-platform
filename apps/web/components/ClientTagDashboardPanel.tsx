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

import { StatCard, StatCardRow } from "./StatCard";
import { cardStyle, cellStyle, subtleTextStyle, primaryButtonStyle } from "./dashboard-styles";

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
  { value: "website", label: "🌐 Website" },
  { value: "messenger", label: "💬 Messenger" },
  { value: "instagram", label: "📷 Instagram" },
  { value: "whatsapp", label: "🟢 WhatsApp" },
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
  const arrow = n >= 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(n).toFixed(1)}% vs previous period`;
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
    const confirmed = window.confirm(`Delete "${tag.label}"? This removes it from every conversation it's applied to.`);
    if (!confirmed) return;
    await fetch(`/api/admin/tags?id=${encodeURIComponent(tag.id)}`, { method: "DELETE" });
    refreshTags();
  }

  const myTags = useMemo(() => (tags ?? []).filter((t) => t.businessId === businessId), [tags, businessId]);

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Dashboard</h2>
      <p style={subtleTextStyle}>
        Tag-based reporting for this business — every number recomputed live from actual tag assignments, never a
        stale running total. A tag used twice in one chat still counts once.
      </p>

      {/* Filter bar — every chart/table below reacts to this together. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
          From
          <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} style={{ padding: 6 }} />
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
          To
          <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} style={{ padding: 6 }} />
        </label>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={{ padding: 6 }}>
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select
          multiple
          value={tagFilter}
          onChange={(e) => setTagFilter(Array.from(e.target.selectedOptions, (o) => o.value))}
          style={{ padding: 6, minWidth: 160, height: 34 }}
        >
          {(tags ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        {tagFilter.length > 0 && (
          <button onClick={() => setTagFilter([])} style={{ fontSize: 12 }}>Clear tag filter</button>
        )}
      </div>

      {!analytics && <p>Loading…</p>}

      {analytics && (
        <>
          <StatCardRow>
            <StatCard
              label="Total tagged conversations"
              value={String(analytics.totalTaggedConversations)}
              hint={fmtDelta(analytics.totalTaggedConversationsDeltaPct)}
            />
            <StatCard
              label="Conversion rate"
              value={fmtPct(analytics.conversionRate)}
              hint={fmtDelta(analytics.conversionRateDeltaPct)}
            />
            <StatCard label="Top tag" value={analytics.topTag ? analytics.topTag.label : "—"} hint={analytics.topTag ? `${analytics.topTag.count} conversations` : undefined} />
          </StatCardRow>

          {analytics.funnel.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Funnel</h3>
                <button onClick={() => downloadCsv("funnel.csv", analytics.funnel.map((f) => ({ stage: f.label, count: f.count, conversionFromPrevious: f.conversionFromPrevious ?? "" })))}>
                  Download CSV
                </button>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(120, analytics.funnel.length * 50)}>
                <BarChart data={analytics.funnel} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={120} />
                  <Tooltip formatter={(value: number, name: string) => [value, name]} />
                  <Bar dataKey="count" fill="#58a6ff" />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                {analytics.funnel.map((f, i) => (i > 0 ? <span key={f.tagId}>{f.label}: {fmtPct(f.conversionFromPrevious)} conversion{i < analytics.funnel.length - 1 ? " · " : ""}</span> : null))}
              </div>

              {analytics.funnelVelocity.length > 0 && (
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                  {analytics.funnelVelocity.map((v) => (
                    <div key={`${v.fromLabel}-${v.toLabel}`}>
                      {v.fromLabel} → {v.toLabel}: avg {v.avgDays !== null ? `${v.avgDays.toFixed(1)} days` : "—"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Trend</h3>
              <button onClick={() => downloadCsv("trend.csv", analytics.trend.map((t) => ({ date: t.date, count: t.count })))}>
                Download CSV
              </button>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={analytics.trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" name="Tagged conversations" stroke="#3fb950" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Tags</h3>
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
              >
                Download CSV
              </button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={cellStyle}>Tag</th>
                  <th style={cellStyle}>Count</th>
                  <th style={cellStyle}>% of total</th>
                  <th style={cellStyle}>Website</th>
                  <th style={cellStyle}>Messenger</th>
                  <th style={cellStyle}>Instagram</th>
                  <th style={cellStyle}>WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {analytics.tagCounts.map((t) => (
                  <tr key={t.tagId}>
                    <td style={cellStyle}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: t.color ?? "#8b949e", marginRight: 8 }} />
                      {t.label}
                    </td>
                    <td style={cellStyle}>{t.count}</td>
                    <td style={cellStyle}>{t.pctOfTotal.toFixed(1)}%</td>
                    <td style={cellStyle}>{t.channelBreakdown.website ?? 0}</td>
                    <td style={cellStyle}>{t.channelBreakdown.messenger ?? 0}</td>
                    <td style={cellStyle}>{t.channelBreakdown.instagram ?? 0}</td>
                    <td style={cellStyle}>{t.channelBreakdown.whatsapp ?? 0}</td>
                  </tr>
                ))}
                {analytics.tagCounts.length === 0 && (
                  <tr>
                    <td style={cellStyle} colSpan={7}>No tagged conversations in this range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Custom pivot table — ad-hoc dimension/measure combinations. */}
      <div style={{ ...cardStyle, background: "rgba(255,255,255,0.02)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Custom pivot table</h3>
          {pivotResult && (
            <button onClick={() => downloadCsv("pivot.csv", pivotResult.rows)}>Download CSV</button>
          )}
        </div>
        <p style={subtleTextStyle}>Pick any combination of dimensions and a measure — recomputes live, like a pivot table.</p>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PIVOT_DIMENSIONS.map((d) => (
              <label key={d.value} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
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
          <select value={pivotMeasure} onChange={(e) => setPivotMeasure(e.target.value as typeof pivotMeasure)} style={{ padding: 6 }}>
            <option value="conversationCount">Conversation count</option>
            <option value="messageCount">Message count</option>
          </select>
        </div>

        {pivotLoading && <p style={subtleTextStyle}>Loading…</p>}

        {!pivotLoading && pivotResult && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {pivotDims.map((d) => (
                  <th key={d} style={cellStyle}>{PIVOT_DIMENSIONS.find((p) => p.value === d)?.label ?? d}</th>
                ))}
                <th style={cellStyle}>Count</th>
              </tr>
            </thead>
            <tbody>
              {pivotResult.rows.map((row, i) => (
                <tr key={i}>
                  {pivotDims.map((d) => (
                    <td key={d} style={cellStyle}>{row[d]}</td>
                  ))}
                  <td style={cellStyle}>{row.count}</td>
                </tr>
              ))}
              {pivotResult.rows.length === 0 && (
                <tr>
                  <td style={cellStyle} colSpan={pivotDims.length + 1}>No data for this combination.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* My tags — this client's own private catalog, separate from the platform's. */}
      <div style={{ marginTop: 24 }}>
        <h3>My tags</h3>
        <p style={subtleTextStyle}>Private to your business — the platform team can&apos;t see or edit these, and other clients never see them.</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            style={{ padding: 8, flex: 1, minWidth: 160 }}
            placeholder="Tag label"
            value={newTagLabel}
            onChange={(e) => setNewTagLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addMyTag();
            }}
          />
          <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} style={{ width: 40, height: 34, padding: 0, border: "1px solid var(--border)" }} />
          <button onClick={addMyTag} style={primaryButtonStyle}>+ New tag</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {myTags.map((t) => (
            <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.06)", fontSize: 13 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: t.color ?? "#8b949e" }} />
              {t.label}
              <button onClick={() => deleteMyTag(t)} style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.6, padding: 0 }}>✕</button>
            </span>
          ))}
          {myTags.length === 0 && <span style={subtleTextStyle}>No private tags yet.</span>}
        </div>
      </div>
    </section>
  );
}
