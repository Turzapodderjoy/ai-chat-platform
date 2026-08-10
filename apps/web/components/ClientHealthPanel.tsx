"use client";

import { useEffect, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle } from "./dashboard-styles";

interface ClientHealthRow {
  businessId: string;
  businessName: string;
  crawlTargets: { total: number; done: number; stuck: number };
  documentCount: number;
  masterCsv: { updatedAt: string | null; sourceCount: number };
  lastRefreshAt: string | null;
  embeddingCoverage: Array<{ provider: string; pct: number }>;
  openHandoffs: number;
  totalConversations: number;
  providerUsage: Array<{ provider: string; count: number }>;
}

/** One consolidated per-client health view — knowledge base, embedding
 * coverage, handoffs, and recent AI provider usage, all in one row
 * instead of checking five separate tabs per business. Loaded on
 * demand (only while this tab is active), not polled — every query
 * behind it does real work (crawl status, a vector-table scan, message
 * aggregation), so it isn't cheap enough for a background interval. */
export function ClientHealthPanel({ active = true }: { active?: boolean }) {
  const [rows, setRows] = useState<ClientHealthRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    setError("");
    fetch("/api/admin/client-health")
      .then((r) => r.json())
      .then((d: { rows: ClientHealthRow[] }) => setRows(d.rows))
      .catch(() => setError("Failed to load — try again."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (active) load();
  }, [active]);

  return (
    <section>
      <h1 style={{ marginBottom: 4 }}>Client Health</h1>
      <p style={subtleTextStyle}>
        Everything about a client's knowledge base, embedding coverage, handoffs, and which AI
        provider has actually been answering their chats — one row per client.
      </p>

      <div style={{ marginBottom: 12 }}>
        <button onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        {error && <span style={{ marginLeft: 8, fontSize: 13, color: "var(--warning, #b45309)" }}>{error}</span>}
      </div>

      <div style={cardStyle}>
        {!rows && !error && <p style={subtleTextStyle}>Loading…</p>}

        {rows && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle}>Client</th>
                <th style={cellStyle}>Crawl</th>
                <th style={cellStyle}>Documents</th>
                <th style={cellStyle}>Master CSV</th>
                <th style={cellStyle}>Embedding coverage</th>
                <th style={cellStyle}>Open handoffs</th>
                <th style={cellStyle}>Conversations</th>
                <th style={cellStyle}>AI usage (7d)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const targetsOk =
                  row.crawlTargets.total === 0 ||
                  (row.crawlTargets.done === row.crawlTargets.total && row.crawlTargets.stuck === 0);
                const csvOk = row.masterCsv.updatedAt !== null && row.masterCsv.sourceCount >= row.documentCount;

                return (
                  <tr key={row.businessId}>
                    <td style={cellStyle}>{row.businessName}</td>
                    <td style={cellStyle}>
                      {row.crawlTargets.total === 0 ? (
                        "—"
                      ) : (
                        <span style={{ color: targetsOk ? "var(--success, #15803d)" : "var(--warning, #b45309)" }}>
                          {targetsOk ? "✅" : "⚠️"} {row.crawlTargets.done}/{row.crawlTargets.total}
                          {row.crawlTargets.stuck > 0 ? ` (${row.crawlTargets.stuck} stuck)` : ""}
                        </span>
                      )}
                    </td>
                    <td style={cellStyle}>{row.documentCount}</td>
                    <td style={cellStyle}>
                      {row.masterCsv.updatedAt ? (
                        <span style={{ color: csvOk ? "var(--success, #15803d)" : "var(--warning, #b45309)" }}>
                          {csvOk ? "✅" : "⚠️"} {row.masterCsv.sourceCount}/{row.documentCount}
                        </span>
                      ) : (
                        <span style={subtleTextStyle}>not generated</span>
                      )}
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                        last run: {row.lastRefreshAt ? new Date(row.lastRefreshAt).toLocaleString() : "never"}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      {row.embeddingCoverage.length === 0 && "—"}
                      {row.embeddingCoverage.map((c) => (
                        <div key={c.provider} style={{ fontSize: 12 }}>
                          {c.provider}: {c.pct === 100 ? "✅" : "⚠️"} {c.pct}%
                        </div>
                      ))}
                    </td>
                    <td style={cellStyle}>
                      {row.openHandoffs > 0 ? (
                        <span style={{ color: "var(--warning, #b45309)" }}>⚠️ {row.openHandoffs}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td style={cellStyle}>{row.totalConversations}</td>
                    <td style={cellStyle}>
                      {row.providerUsage.length === 0 && <span style={subtleTextStyle}>no activity</span>}
                      {row.providerUsage.map((u) => (
                        <div key={u.provider} style={{ fontSize: 12 }}>
                          {u.provider}: {u.count}
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td style={cellStyle} colSpan={8}>No clients yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
