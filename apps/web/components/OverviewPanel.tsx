"use client";

import { useEffect, useState } from "react";

import { StatCard, StatCardRow } from "./StatCard";
import { subtleTextStyle, cardStyle, cellStyle, primaryButtonStyle } from "./dashboard-styles";

interface BusinessKnowledgeStatus {
  businessId: string;
  businessName: string;
  crawlTargets: { total: number; done: number; stuck: number };
  documentCount: number;
  masterCsv: { updatedAt: string | null; sourceCount: number };
  lastRunAt: string | null;
}

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
  const [knowledgeStatus, setKnowledgeStatus] = useState<BusinessKnowledgeStatus[] | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshAllMessage, setRefreshAllMessage] = useState("");

  function refreshKnowledgeStatus() {
    fetch("/api/admin/knowledge/status-all")
      .then((r) => r.json())
      .then((d: { status: BusinessKnowledgeStatus[] }) => setKnowledgeStatus(d.status));
  }

  async function runRefreshAll() {
    setRefreshingAll(true);
    setRefreshAllMessage("Started — recrawling and rebuilding the master CSV for every client, this runs in the background and can take several minutes per client…");

    try {
      await fetch("/api/admin/knowledge/refresh-all", { method: "POST" });

      const poll = setInterval(refreshKnowledgeStatus, 8000);
      setTimeout(() => {
        clearInterval(poll);
        setRefreshingAll(false);
        refreshKnowledgeStatus();
      }, 60000);
    } catch {
      setRefreshingAll(false);
      setRefreshAllMessage("Failed to start.");
    }
  }

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

    refreshKnowledgeStatus();
  }, [active]);

  const val = (n: number | null) => (n === null ? "…" : String(n));

  return (
    <section>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 4 }}>Overview</h1>
        <p style={subtleTextStyle}>
          Platform-wide snapshot — every number below comes from the tab it
          summarizes, use the sidebar to drill in.
        </p>
      </div>

      <StatCardRow>
        <StatCard label="Clients" value={val(counts.clients)} tone="info" />
        <StatCard
          label="Open handoffs"
          value={val(counts.openHandoffs)}
          hint={counts.totalHandoffs !== null ? `${counts.totalHandoffs} total` : undefined}
          tone={counts.openHandoffs !== null && counts.openHandoffs > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Pending AI Brain suggestions"
          value={val(counts.pendingSuggestions)}
          tone={counts.pendingSuggestions !== null && counts.pendingSuggestions > 0 ? "warning" : "success"}
        />
        <StatCard
          label="QA feedback awaiting review"
          value={val(counts.qaUnprocessed)}
          hint={counts.qaTotal !== null ? `${counts.qaTotal} total submitted` : undefined}
          tone={counts.qaUnprocessed !== null && counts.qaUnprocessed > 0 ? "warning" : "success"}
        />
        <StatCard
          label="AI providers healthy"
          value={counts.aiHealthy !== null && counts.aiTotal !== null ? `${counts.aiHealthy}/${counts.aiTotal}` : "…"}
          tone={counts.aiHealthy !== null && counts.aiTotal !== null && counts.aiHealthy === counts.aiTotal ? "success" : "warning"}
        />
        <StatCard
          label="Embedding providers healthy"
          value={
            counts.embeddingHealthy !== null && counts.embeddingTotal !== null
              ? `${counts.embeddingHealthy}/${counts.embeddingTotal}`
              : "…"
          }
          tone={
            counts.embeddingHealthy !== null &&
            counts.embeddingTotal !== null &&
            counts.embeddingHealthy === counts.embeddingTotal
              ? "success"
              : "warning"
          }
        />
      </StatCardRow>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Knowledge base — all clients</h3>
        <p style={subtleTextStyle}>
          Recrawls every site, re-processes every uploaded document, and rebuilds one master CSV per
          client, for every business at once. Each client's refresh runs independently and can take
          several minutes — that's expected. On the platform's current hosting, a single run may not
          finish a large site in one pass; auto-heal (every 30 minutes) picks up anything left stuck.
        </p>
        <button onClick={runRefreshAll} disabled={refreshingAll} style={primaryButtonStyle}>
          {refreshingAll ? "Running…" : "Refresh all clients now"}
        </button>
        {refreshAllMessage && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{refreshAllMessage}</p>}

        {!knowledgeStatus && <p style={subtleTextStyle}>Loading…</p>}

        {knowledgeStatus && (
          <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
            <thead>
              <tr>
                <th style={cellStyle}>Client</th>
                <th style={cellStyle}>Crawl targets</th>
                <th style={cellStyle}>Documents indexed</th>
                <th style={cellStyle}>Master CSV</th>
                <th style={cellStyle}>Last refresh</th>
              </tr>
            </thead>
            <tbody>
              {knowledgeStatus.map((s) => {
                const csvOk = s.masterCsv.updatedAt !== null && s.masterCsv.sourceCount >= s.documentCount;
                const targetsOk = s.crawlTargets.total === 0 || (s.crawlTargets.done === s.crawlTargets.total && s.crawlTargets.stuck === 0);
                return (
                  <tr key={s.businessId}>
                    <td style={cellStyle}>{s.businessName}</td>
                    <td style={cellStyle}>
                      {s.crawlTargets.total === 0 ? (
                        "—"
                      ) : (
                        <span style={{ color: targetsOk ? "var(--success, #15803d)" : "var(--warning, #b45309)" }}>
                          {targetsOk ? "✅" : "⚠️"} {s.crawlTargets.done}/{s.crawlTargets.total} done
                          {s.crawlTargets.stuck > 0 ? ` (${s.crawlTargets.stuck} stuck)` : ""}
                        </span>
                      )}
                    </td>
                    <td style={cellStyle}>{s.documentCount}</td>
                    <td style={cellStyle}>
                      {s.masterCsv.updatedAt ? (
                        <span style={{ color: csvOk ? "var(--success, #15803d)" : "var(--warning, #b45309)" }}>
                          {csvOk ? "✅" : "⚠️"} {s.masterCsv.sourceCount}/{s.documentCount} sources
                        </span>
                      ) : (
                        <span style={subtleTextStyle}>not generated</span>
                      )}
                    </td>
                    <td style={cellStyle}>
                      {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "never"}
                    </td>
                  </tr>
                );
              })}
              {knowledgeStatus.length === 0 && (
                <tr>
                  <td style={cellStyle} colSpan={5}>No clients yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </section>
  );
}
