"use client";

import { useEffect, useRef, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle } from "./dashboard-styles";
import { StatusBadge } from "./StatusBadge";

interface ClientHealthRow {
  businessId: string;
  businessName: string;
  crawlTargets: { total: number; done: number; stuck: number };
  refreshPhase:
    | { phase: "crawling"; pagesDone: number; pagesEstimated: number; queueRemaining: number | null }
    | { phase: "embedding"; pagesIndexed: number; pagesTotal: number }
    | { phase: "building_csv" }
    | null;
  documentCount: number;
  productCount: number;
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

  // For "crawling", pagesEstimated is NOT a fixed target — it's just the
  // highest visited count seen so far, and grows in lockstep with
  // pagesDone as BFS discovers more pages (confirmed live: this made the
  // naive total-minus-current math always read ~0 remaining, even a
  // fraction of the way through a multi-thousand-page crawl). The real
  // remaining count is the frontier's own queue length.
  const current = phase.phase === "crawling" ? phase.pagesDone : phase.pagesIndexed;
  const remaining =
    phase.phase === "crawling" ? phase.queueRemaining : Math.max(0, phase.pagesTotal - phase.pagesIndexed);

  const existing = track[key];
  if (!existing || existing.phase !== phase.phase) {
    track[key] = { phase: phase.phase, startTime: Date.now(), startCount: current };
    return "calculating…";
  }

  const elapsedMs = Date.now() - existing.startTime;
  const progressed = current - existing.startCount;

  if (elapsedMs < 3000 || progressed <= 0) return "calculating…";
  if (remaining === null) return "calculating…";

  const rate = progressed / elapsedMs; // items per ms
  return `~${formatDuration(Math.round(remaining / rate / 1000))} left`;
}

/** One small badge per pipeline stage — done (filled dot), currently
 * running (a live count + pulsing dot, so "is it stuck" is answerable
 * without opening logs), or pending (dimmed, hasn't started this run). */
function StepBadge({ label, state, detail }: { label: string; state: StepState; detail?: string }) {
  const dotColor = state === "done" ? "var(--success)" : state === "active" ? "var(--accent)" : "var(--text-faint)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: state === "pending" ? 0.45 : 1 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
          boxShadow: state === "active" ? `0 0 5px ${dotColor}` : "none",
        }}
      />
      {label}
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
  const [triggering, setTriggering] = useState<string | null>(null);
  const phaseTrackRef = useRef<Record<string, PhaseTrack>>({});

  // Recrawl + reembed + rebuild master CSV + resync the Product table —
  // all one call, since runCrawl() already chains all four (see
  // ProductSyncService's wiring into CrawlerService). Fire-and-forget,
  // same reasoning as the Knowledge Hub's own "Run now" — this can take
  // a genuinely long time on a large site.
  async function runFullUpdate(businessId: string) {
    setTriggering(businessId);
    try {
      await fetch("/api/admin/knowledge/refresh-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      load();
    } finally {
      setTriggering(null);
    }
  }

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
          // This table has 11 columns of genuinely wide content (a
          // multi-line provider-usage list, long refresh-status text) --
          // width:100% on the table itself doesn't stop it growing past
          // its container once content needs more room (table-layout is
          // auto, not fixed), which is exactly why the action column was
          // rendering outside the card's visible edge. Scrolling this
          // wrapper instead of the table keeps everything -- including
          // "Run full update" -- inside the card, reachable by scrolling
          // right rather than spilling into the page.
          <div className="table-scroll">
          <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle}>Client</th>
                <th style={cellStyle}>Crawl</th>
                <th style={cellStyle}>Refresh status</th>
                <th style={cellStyle}>Documents</th>
                <th style={cellStyle}>Products</th>
                <th style={cellStyle}>Master CSV</th>
                <th style={cellStyle}>Embedding coverage</th>
                <th style={cellStyle}>Open handoffs</th>
                <th style={cellStyle}>Conversations</th>
                <th style={cellStyle}>AI usage (7d)</th>
                <th style={cellStyle}></th>
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
                        <StatusBadge tone={targetsOk ? "ok" : "warn"}>
                          {row.crawlTargets.done}/{row.crawlTargets.total}
                          {row.crawlTargets.stuck > 0 ? ` (${row.crawlTargets.stuck} stuck)` : ""}
                        </StatusBadge>
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
                                // pagesEstimated tracks "highest visited so
                                // far", not a fixed target (it grows in step
                                // with pagesDone as BFS finds more pages) —
                                // queueRemaining is the honest denominator
                                // whenever it's known.
                                width: `${
                                  row.refreshPhase.queueRemaining !== null
                                    ? Math.min(
                                        100,
                                        Math.round(
                                          (row.refreshPhase.pagesDone /
                                            (row.refreshPhase.pagesDone + row.refreshPhase.queueRemaining)) *
                                            100
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
                            crawling: {row.refreshPhase.pagesDone} done
                            {row.refreshPhase.queueRemaining !== null
                              ? `, ~${row.refreshPhase.queueRemaining} left in queue`
                              : ""}
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
                                  ? row.refreshPhase.queueRemaining !== null
                                    ? `${row.refreshPhase.pagesDone} done, ~${row.refreshPhase.queueRemaining} left`
                                    : `${row.refreshPhase.pagesDone} done`
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
                      {row.productCount > 0 ? (
                        row.productCount
                      ) : (
                        <span style={subtleTextStyle}>none yet</span>
                      )}
                    </td>
                    <td style={cellStyle}>
                      {row.masterCsv.updatedAt ? (
                        <StatusBadge tone={csvOk ? "ok" : "warn"}>
                          {row.masterCsv.sourceCount}/{row.documentCount}
                        </StatusBadge>
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
                        <div key={c.provider} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          {c.provider}: <StatusBadge tone={c.pct === 100 ? "ok" : "warn"}>{c.pct}%</StatusBadge>
                        </div>
                      ))}
                    </td>
                    <td style={cellStyle}>
                      {row.openHandoffs > 0 ? (
                        <StatusBadge tone="warn">{row.openHandoffs}</StatusBadge>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td style={cellStyle}>{row.totalConversations}</td>
                    <td style={cellStyle}>
                      {/* Capped + scrollable, not left to grow unbounded --
                       * a business with many providers/handoff variants
                       * (confirmed live: 13+ lines) was stretching the
                       * WHOLE row to match, leaving every other cell in
                       * that row sitting on a mostly-empty 300px+ tall
                       * row regardless of vertical-align. */}
                      <div style={{ maxHeight: 110, overflowY: "auto" }}>
                        {row.providerUsage.length === 0 && <span style={subtleTextStyle}>no activity</span>}
                        {row.providerUsage.map((u) => (
                          <div key={u.provider} style={{ fontSize: 12 }}>
                            {u.provider}: {u.count}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <button
                        onClick={() => runFullUpdate(row.businessId)}
                        disabled={triggering === row.businessId || row.refreshPhase !== null}
                        title="Recrawl + reembed + rebuild master CSV + resync product catalog"
                      >
                        {triggering === row.businessId
                          ? "Starting…"
                          : row.refreshPhase !== null
                            ? "Running…"
                            : "Run full update"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td style={cellStyle} colSpan={11}>No clients yet.</td>
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
