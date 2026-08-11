"use client";

import { useEffect, useRef, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle } from "./dashboard-styles";

interface ClientHealthRow {
  businessId: string;
  businessName: string;
  crawlTargets: { total: number; done: number; stuck: number };
  refreshPhase:
    | { phase: "crawling"; pagesDone: number; pagesEstimated: number }
    | { phase: "embedding"; pagesIndexed: number; pagesTotal: number }
    | { phase: "building_csv" }
    | null;
  documentCount: number;
  masterCsv: { updatedAt: string | null; sourceCount: number };
  lastRefreshAt: string | null;
  embeddingCoverage: Array<{ provider: string; pct: number }>;
  openHandoffs: number;
  totalConversations: number;
  providerUsage: Array<{ provider: string; count: number }>;
}

// Every query behind this endpoint does real work (crawl status, a
// vector-table scan, message aggregation) — too expensive for a tight
// interval. Only worth auto-polling at all while a crawl is actually
// running (so "no Claude needed to watch it" works); idle, it stays
// on-demand-only.
const POLL_WHILE_CRAWLING_MS = 10_000;

type StepState = "done" | "active" | "pending";

type PhaseTrack = { phase: string; startTime: number; startCount: number };

/** m/h/s, whichever's coarsest fits — no need for millisecond precision
 * on a multi-minute crawl. */
function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

/** Real-time ETA from OBSERVED throughput, not a fixed assumption — rate
 * is measured from how far this phase has actually gotten since the
 * moment it was first seen (in `track`, keyed per business+phase so it
 * resets cleanly whenever the phase changes), not a per-poll instant
 * delta (way too noisy at a 10s poll interval — a single slow page
 * would send the estimate wild). Self-corrects as the phase progresses:
 * the more of it that's happened, the more accurate the rate. */
function computeEta(row: ClientHealthRow, track: Record<string, PhaseTrack>): string {
  const phase = row.refreshPhase;
  if (!phase) return "";

  const key = row.businessId;

  if (phase.phase === "building_csv") {
    if (track[key]?.phase !== "building_csv") {
      track[key] = { phase: "building_csv", startTime: Date.now(), startCount: 0 };
      return "just started";
    }
    return `${formatDuration(Math.round((Date.now() - track[key]!.startTime) / 1000))} elapsed (no fixed size to estimate against)`;
  }

  const [current, total] =
    phase.phase === "crawling" ? [phase.pagesDone, phase.pagesEstimated] : [phase.pagesIndexed, phase.pagesTotal];

  const existing = track[key];
  if (!existing || existing.phase !== phase.phase) {
    track[key] = { phase: phase.phase, startTime: Date.now(), startCount: current };
    return "calculating…";
  }

  const elapsedMs = Date.now() - existing.startTime;
  const progressed = current - existing.startCount;

  if (elapsedMs < 3000 || progressed <= 0) return "calculating…";

  const rate = progressed / elapsedMs; // items per ms
  const remaining = Math.max(0, total - current);
  return `~${formatDuration(Math.round(remaining / rate / 1000))} left`;
}

/** One small badge per pipeline stage — done (✅), currently running (a
 * live count, so "is it stuck" is answerable without opening logs), or
 * pending (dimmed, hasn't started this run). */
function StepBadge({ label, state, detail }: { label: string; state: StepState; detail?: string }) {
  const icon = state === "done" ? "✅" : state === "active" ? "🔵" : "⚪";
  return (
    <div style={{ fontSize: 12, opacity: state === "pending" ? 0.45 : 1 }}>
      {icon} {label}
      {detail && <span style={{ color: "var(--text-faint)" }}> — {detail}</span>}
    </div>
  );
}

/** One consolidated per-client health view — knowledge base, embedding
 * coverage, handoffs, and recent AI provider usage, all in one row
 * instead of checking five separate tabs per business. */
export function ClientHealthPanel({ active = true }: { active?: boolean }) {
  const [rows, setRows] = useState<ClientHealthRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const phaseTrackRef = useRef<Record<string, PhaseTrack>>({});

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

  const anyRefreshing = rows?.some((r) => r.refreshPhase !== null) ?? false;
  useEffect(() => {
    if (!active || !anyRefreshing) return;
    const id = setInterval(load, POLL_WHILE_CRAWLING_MS);
    return () => clearInterval(id);
  }, [active, anyRefreshing]);

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
                <th style={cellStyle}>Refresh status</th>
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
                      {row.refreshPhase?.phase === "crawling" && (
                        <div style={{ marginTop: 4 }}>
                          <div
                            style={{
                              width: 100,
                              height: 5,
                              borderRadius: 3,
                              background: "var(--border, #e5e7eb)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${
                                  row.refreshPhase.pagesEstimated > 0
                                    ? Math.min(
                                        100,
                                        Math.round(
                                          (row.refreshPhase.pagesDone / row.refreshPhase.pagesEstimated) * 100
                                        )
                                      )
                                    : 0
                                }%`,
                                height: "100%",
                                background: "var(--accent, #2563eb)",
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                            crawling: {row.refreshPhase.pagesDone}/{row.refreshPhase.pagesEstimated} pages
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={cellStyle}>
                      {(() => {
                        // refreshPhase === null means "nothing in progress
                        // right now" — that's "all done" if a CSV already
                        // exists from a past run, or "never run yet" (every
                        // step still pending) if it doesn't.
                        const neverRun = row.refreshPhase === null && row.masterCsv.updatedAt === null;
                        const idleState: StepState = neverRun ? "pending" : "done";

                        return (
                          <>
                            <StepBadge
                              label="Crawled"
                              state={row.refreshPhase?.phase === "crawling" ? "active" : idleState}
                              detail={
                                row.refreshPhase?.phase === "crawling"
                                  ? `${row.refreshPhase.pagesDone}/${row.refreshPhase.pagesEstimated}`
                                  : undefined
                              }
                            />
                            <StepBadge
                              label="Embedded"
                              state={
                                row.refreshPhase?.phase === "embedding"
                                  ? "active"
                                  : row.refreshPhase?.phase === "crawling"
                                    ? "pending"
                                    : idleState
                              }
                              detail={
                                row.refreshPhase?.phase === "embedding"
                                  ? `${row.refreshPhase.pagesIndexed}/${row.refreshPhase.pagesTotal}`
                                  : undefined
                              }
                            />
                            <StepBadge
                              label="CSV built"
                              state={
                                row.refreshPhase?.phase === "building_csv"
                                  ? "active"
                                  : row.refreshPhase?.phase === "crawling" || row.refreshPhase?.phase === "embedding"
                                    ? "pending"
                                    : idleState
                              }
                            />
                            {row.refreshPhase && (
                              <div style={{ fontSize: 11, color: "var(--accent, #2563eb)", marginTop: 2 }}>
                                ETA: {computeEta(row, phaseTrackRef.current)}
                              </div>
                            )}
                          </>
                        );
                      })()}
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
                  <td style={cellStyle} colSpan={9}>No clients yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
