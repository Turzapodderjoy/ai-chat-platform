"use client";

import { useEffect, useRef, useState } from "react";

import type { CSSProperties } from "react";

import { cardStyle, subtleTextStyle } from "./dashboard-styles";
import { StatusBadge } from "./StatusBadge";

const fieldLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-faint)",
  marginBottom: 8,
};

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

      {!rows && !error && <p style={subtleTextStyle}>Loading…</p>}

      {rows && rows.length === 0 && <p style={subtleTextStyle}>No clients yet.</p>}

      {/* One card per client, not a row in an 11-column spreadsheet —
       * this used to be a table wide enough to need horizontal scrolling
       * just to see the action button. A card groups each client's own
       * numbers under its own name instead of making the reader track
       * which column means what across a long row. */}
      {rows?.map((row) => {
        const targetsOk =
          row.crawlTargets.total === 0 ||
          (row.crawlTargets.done === row.crawlTargets.total && row.crawlTargets.stuck === 0);
        const csvOk = row.masterCsv.updatedAt !== null && row.masterCsv.sourceCount >= row.documentCount;
        const neverRun = row.refreshPhase === null && row.masterCsv.updatedAt === null;
        const idleState: StepState = neverRun ? "pending" : "done";

        return (
          <div key={row.businessId} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0 }}>{row.businessName}</h3>
                {row.openHandoffs > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <StatusBadge tone="warn">{row.openHandoffs} open handoff{row.openHandoffs === 1 ? "" : "s"}</StatusBadge>
                  </div>
                )}
              </div>
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
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 18 }}>
              <div>
                <div style={fieldLabelStyle}>Refresh pipeline</div>
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
                  detail={row.refreshPhase?.phase === "embedding" ? `${row.refreshPhase.pagesIndexed}/${row.refreshPhase.pagesTotal}` : undefined}
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
                  <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>ETA: {computeEta(row, phaseTrackRef.current)}</div>
                )}
                {row.refreshPhase?.phase === "crawling" && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ width: "100%", maxWidth: 140, height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${
                            row.refreshPhase.queueRemaining !== null
                              ? Math.min(100, Math.round((row.refreshPhase.pagesDone / (row.refreshPhase.pagesDone + row.refreshPhase.queueRemaining)) * 100))
                              : 0
                          }%`,
                          height: "100%",
                          background: "var(--accent)",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div style={fieldLabelStyle}>Crawl targets</div>
                {row.crawlTargets.total === 0 ? (
                  <span style={subtleTextStyle}>—</span>
                ) : (
                  <StatusBadge tone={targetsOk ? "ok" : "warn"}>
                    {row.crawlTargets.done}/{row.crawlTargets.total}
                    {row.crawlTargets.stuck > 0 ? ` (${row.crawlTargets.stuck} stuck)` : ""}
                  </StatusBadge>
                )}
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                  {row.documentCount} document{row.documentCount === 1 ? "" : "s"} · {row.productCount > 0 ? `${row.productCount} products` : "no products yet"}
                </div>
              </div>

              <div>
                <div style={fieldLabelStyle}>Master CSV</div>
                {row.masterCsv.updatedAt ? (
                  <StatusBadge tone={csvOk ? "ok" : "warn"}>
                    {row.masterCsv.sourceCount}/{row.documentCount} sources
                  </StatusBadge>
                ) : (
                  <span style={subtleTextStyle}>not generated</span>
                )}
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                  last run: {row.lastRefreshAt ? new Date(row.lastRefreshAt).toLocaleString() : "never"}
                </div>
              </div>

              <div>
                <div style={fieldLabelStyle}>Embedding coverage</div>
                {row.embeddingCoverage.length === 0 && <span style={subtleTextStyle}>—</span>}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {row.embeddingCoverage.map((c) => (
                    <div key={c.provider} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "var(--text-muted)" }}>{c.provider}</span>
                      <StatusBadge tone={c.pct === 100 ? "ok" : "warn"}>{c.pct}%</StatusBadge>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={fieldLabelStyle}>Conversations</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{row.totalConversations}</div>
              </div>

              <div>
                <div style={fieldLabelStyle}>AI usage (7d)</div>
                <div style={{ maxHeight: 110, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                  {row.providerUsage.length === 0 && <span style={subtleTextStyle}>no activity</span>}
                  {row.providerUsage.map((u) => (
                    <div key={u.provider} style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {u.provider}: <span style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{u.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
