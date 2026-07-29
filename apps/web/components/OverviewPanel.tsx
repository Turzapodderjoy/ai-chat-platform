"use client";

import { useEffect, useState } from "react";

import { StatCard, StatCardRow } from "./StatCard";
import { cardStyle, cellStyle, subtleTextStyle } from "./dashboard-styles";

interface Counts {
  clients: number | null;
  openHandoffs: number | null;
  totalHandoffs: number | null;
  pendingSuggestions: number | null;
  qaUnprocessed: number | null;
  qaTotal: number | null;
  aiHealthy: number | null;
  aiTotal: number | null;
  embeddingHealthy: number | null;
  embeddingTotal: number | null;
}

interface RecentRun {
  id: string;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string | null;
  conversationsProcessed: number;
  suggestionsCreated: number;
}

/**
 * Mother dashboard's landing tab — every number here is read from an
 * endpoint another tab already uses (nothing new on the backend), just
 * surfaced together so there's one place to see the platform's overall
 * state before drilling into a specific section.
 */
export function OverviewPanel({ active = true }: { active?: boolean }) {
  const [counts, setCounts] = useState<Counts>({
    clients: null,
    openHandoffs: null,
    totalHandoffs: null,
    pendingSuggestions: null,
    qaUnprocessed: null,
    qaTotal: null,
    aiHealthy: null,
    aiTotal: null,
    embeddingHealthy: null,
    embeddingTotal: null,
  });
  const [runs, setRuns] = useState<RecentRun[] | null>(null);

  // Refetches every time this tab becomes active (not just on first
  // mount) — panels stay permanently mounted across tab switches (so
  // Chat Demo's conversation survives), which previously meant this
  // panel's numbers went stale forever after the first load since
  // nothing ever triggered a second fetch.
  useEffect(() => {
    if (!active) return;

    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((d) => setCounts((c) => ({ ...c, clients: d.clients.length })));

    fetch("/api/admin/handoffs")
      .then((r) => r.json())
      .then((d: { handoffs: { status: string }[] }) =>
        setCounts((c) => ({
          ...c,
          totalHandoffs: d.handoffs.length,
          openHandoffs: d.handoffs.filter((h) => h.status === "pending").length,
        }))
      );

    fetch("/api/admin/training/suggestions")
      .then((r) => r.json())
      .then((d) => setCounts((c) => ({ ...c, pendingSuggestions: d.pending.length })));

    fetch("/api/admin/qa-feedback")
      .then((r) => r.json())
      .then((d: { feedback: { processed: boolean }[] }) =>
        setCounts((c) => ({
          ...c,
          qaTotal: d.feedback.length,
          qaUnprocessed: d.feedback.filter((f) => !f.processed).length,
        }))
      );

    fetch("/api/admin/providers")
      .then((r) => r.json())
      .then((d: { status: { enabled: boolean; healthy: boolean }[] }) =>
        setCounts((c) => ({
          ...c,
          aiTotal: d.status.length,
          aiHealthy: d.status.filter((p) => p.enabled && p.healthy).length,
        }))
      );

    fetch("/api/admin/embedding-providers")
      .then((r) => r.json())
      .then((d: { status: { enabled: boolean; healthy: boolean }[] }) =>
        setCounts((c) => ({
          ...c,
          embeddingTotal: d.status.length,
          embeddingHealthy: d.status.filter((p) => p.enabled && p.healthy).length,
        }))
      );

    fetch("/api/admin/training/runs")
      .then((r) => r.json())
      .then((d: { runs: RecentRun[] }) => setRuns(d.runs.slice(0, 5)));
  }, [active]);

  const val = (n: number | null) => (n === null ? "…" : String(n));

  return (
    <section>
      <h1 style={{ marginBottom: 4 }}>Overview</h1>
      <p style={subtleTextStyle}>
        Platform-wide snapshot — every number below comes from the tab it
        summarizes, use the sidebar to drill in.
      </p>

      <StatCardRow>
        <StatCard label="Clients" value={val(counts.clients)} />
        <StatCard
          label="Open handoffs"
          value={val(counts.openHandoffs)}
          hint={counts.totalHandoffs !== null ? `${counts.totalHandoffs} total` : undefined}
        />
        <StatCard label="Pending AI Brain suggestions" value={val(counts.pendingSuggestions)} />
        <StatCard
          label="QA feedback awaiting review"
          value={val(counts.qaUnprocessed)}
          hint={counts.qaTotal !== null ? `${counts.qaTotal} total submitted` : undefined}
        />
        <StatCard
          label="AI providers healthy"
          value={counts.aiHealthy !== null && counts.aiTotal !== null ? `${counts.aiHealthy}/${counts.aiTotal}` : "…"}
        />
        <StatCard
          label="Embedding providers healthy"
          value={
            counts.embeddingHealthy !== null && counts.embeddingTotal !== null
              ? `${counts.embeddingHealthy}/${counts.embeddingTotal}`
              : "…"
          }
        />
      </StatCardRow>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Recent training pipeline runs</h3>
        {!runs && <p style={subtleTextStyle}>Loading…</p>}
        {runs && runs.length === 0 && (
          <p style={subtleTextStyle}>No runs yet — see the Training & Insights tab.</p>
        )}
        {runs && runs.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle}>When</th>
                <th style={cellStyle}>Trigger</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Conversations</th>
                <th style={cellStyle}>Suggestions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td style={cellStyle}>{new Date(r.startedAt).toLocaleString()}</td>
                  <td style={cellStyle}>{r.triggeredBy === "manual" ? "👤 Manual" : "⏰ Scheduled"}</td>
                  <td style={cellStyle}>{r.finishedAt ? "✅ Done" : "⏳ Running…"}</td>
                  <td style={cellStyle}>{r.conversationsProcessed}</td>
                  <td style={cellStyle}>{r.suggestionsCreated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
