"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { UploadWidget } from "./UploadWidget";
import { cardStyle, cellStyle, subtleTextStyle, primaryButtonStyle } from "./dashboard-styles";

interface KnowledgeDocument {
  documentId: string;
  filename: string;
  chunks: number;
  status: string;
  lastCrawledAt: string | null;
  lastUpdated: string | null;
}

interface DocumentChunk {
  chunkId: string;
  text: string;
  chunkingMethod: string | null;
}

interface CoverageEntry {
  provider: string;
  chunksEmbedded: number;
  totalChunks: number;
  lastIndexedAt: string | null;
  enabled: boolean;
  healthy: boolean;
  hasUsableKey: boolean;
}

interface CrawlTarget {
  id: string;
  url: string;
  status: string;
  pagesEstimated: number | null;
  pagesDone: number;
  lastCrawledAt: string | null;
  lastPageCount: number | null;
  lastChunkCount: number | null;
  lastError: string | null;
  updatedAt: string;
}

const ACTIVE_STATUSES = new Set(["queued", "crawling"]);

// Matches auto-heal's STUCK_CRAWLING_MS — a target sitting in "crawling"
// this long with no progress write is dead (the function running it was
// killed mid-crawl), not just slow. Auto-heal retries it automatically
// within this window; this only affects what the panel shows meanwhile.
const STUCK_CRAWLING_MS = 15 * 60 * 1000;

/** Why a provider isn't at 100% coverage — checked in the order that
 * actually blocks embedding (a disabled provider never gets tried at
 * all, regardless of whether it has a key or is healthy). */
function coverageGapReason(c: CoverageEntry, pct: number): string | null {
  if (pct === 100) return null;
  if (!c.enabled) return "Provider is turned off";
  if (!c.hasUsableKey) return "No API key configured";
  if (!c.healthy) return "Provider is currently unreachable/unhealthy";
  return "Not backfilled yet";
}

/** Reused as-is by both the mother dashboard (no businessId = everything)
 * and every per-client dashboard (/dashboard/[businessId]) — one component,
 * so any change here applies everywhere at once. */
export function KnowledgeHubPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null);
  const [coverage, setCoverage] = useState<CoverageEntry[] | null>(null);
  const [targets, setTargets] = useState<CrawlTarget[] | null>(null);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState("");
  const [backfilling, setBackfilling] = useState<string | null>(null);
  const [backfillMessage, setBackfillMessage] = useState("");
  const [healing, setHealing] = useState(false);
  const [healMessage, setHealMessage] = useState("");
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [chunksCache, setChunksCache] = useState<Record<string, DocumentChunk[]>>({});
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [scheduleHour, setScheduleHour] = useState("");
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [masterCsvUpdatedAt, setMasterCsvUpdatedAt] = useState<string | null>(null);
  const [masterCsvSourceCount, setMasterCsvSourceCount] = useState(0);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [refreshingNow, setRefreshingNow] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [docPage, setDocPage] = useState(0);
  const wasActive = useRef(false);
  const DOCS_PER_PAGE = 10;

  function refreshKnowledgeRefresh() {
    if (!businessId) return;
    fetch(`/api/admin/knowledge/schedule?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data) => {
        setScheduleHour(data.hourBd !== null && data.hourBd !== undefined ? String(data.hourBd).padStart(2, "0") + ":00" : "");
        setLastRunAt(data.lastRunAt);
      });

    fetch(`/api/admin/knowledge/master-csv?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data) => {
        setMasterCsvUpdatedAt(data.masterCsv?.updatedAt ?? null);
        setMasterCsvSourceCount(data.masterCsv?.sourceCount ?? 0);
      });
  }

  async function saveSchedule() {
    if (!businessId || !scheduleHour) return;
    const hourBd = Number(scheduleHour.split(":")[0]);
    setSavingSchedule(true);

    try {
      await fetch("/api/admin/knowledge/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, hourBd }),
      });
      refreshKnowledgeRefresh();
    } finally {
      setSavingSchedule(false);
    }
  }

  /** Recrawl + reprocess every upload + rebuild the master CSV — can
   * take minutes, fires in the background (see refresh-now/route.ts),
   * so this just confirms it started and polls for the result. */
  async function runRefreshNow() {
    if (!businessId) return;
    setRefreshingNow(true);
    setRefreshMessage("Started — recrawling and reprocessing every upload, this can take a few minutes…");

    try {
      await fetch("/api/admin/knowledge/refresh-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });

      const poll = setInterval(() => {
        refreshKnowledgeRefresh();
      }, 8000);

      setTimeout(() => {
        clearInterval(poll);
        setRefreshingNow(false);
        setRefreshMessage("Done (or still running in the background — check \"Last run\" above).");
        refreshDocuments();
      }, 60000);
    } catch {
      setRefreshingNow(false);
      setRefreshMessage("Failed to start.");
    }
  }

  /** Toggles the "view extracted data" section under a document row —
   * fetches its chunks once and caches them, so re-expanding after
   * collapsing doesn't refetch. */
  async function toggleChunks(documentId: string) {
    if (expandedDocId === documentId) {
      setExpandedDocId(null);
      return;
    }

    setExpandedDocId(documentId);

    if (!chunksCache[documentId]) {
      setLoadingChunks(true);
      try {
        const res = await fetch(`/api/admin/knowledge/chunks?documentId=${encodeURIComponent(documentId)}`);
        const data = await res.json();
        setChunksCache((prev) => ({ ...prev, [documentId]: data.chunks ?? [] }));
      } finally {
        setLoadingChunks(false);
      }
    }
  }

  function refreshDocuments() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/knowledge${qs}`)
      .then((r) => r.json())
      .then((data) => {
        setDocuments(data.documents);
        setDocPage(0);
      });

    if (businessId) {
      fetch(`/api/admin/embedding-providers/coverage?businessId=${encodeURIComponent(businessId)}`)
        .then((r) => r.json())
        .then((data) => setCoverage(data.coverage));
    }
  }

  function refreshTargets() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/crawler${qs}`)
      .then((r) => r.json())
      .then((data: { targets: CrawlTarget[] }) => {
        setTargets(data.targets);

        const active = data.targets.some((t) => ACTIVE_STATUSES.has(t.status));
        if (wasActive.current && !active) {
          refreshDocuments(); // a crawl just finished — pick up new chunks
        }
        wasActive.current = active;
      });
  }

  useEffect(() => {
    if (!active) return;
    refreshDocuments();
    refreshTargets();
    refreshKnowledgeRefresh();

    // Poll every 2s while anything is crawling so the progress bar moves;
    // gated on `active` since this panel stays mounted (hidden) on other
    // dashboard tabs — a 2s interval left running unconditionally hammers
    // the DB for a tab nobody's looking at.
    const interval = setInterval(refreshTargets, 2000);
    return () => clearInterval(interval);
  }, [businessId, active]);

  async function addSite() {
    if (!url.trim()) return;
    setAdding(true);
    setCrawlMessage("");

    try {
      const res = await fetch("/api/admin/crawler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: businessId ?? "default", url }),
      });
      const result = await res.json();

      if (res.ok) {
        setUrl("");
        refreshTargets();
      } else {
        setCrawlMessage(`Error: ${result.error}`);
      }
    } finally {
      setAdding(false);
    }
  }

  async function recrawl(id: string) {
    await fetch("/api/admin/crawler/recrawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    refreshTargets();
  }

  async function deleteDocument(doc: KnowledgeDocument) {
    const confirmed = window.confirm(
      `Delete "${doc.filename}" (${doc.chunks} chunk${doc.chunks === 1 ? "" : "s"}) from the knowledge base? This cannot be undone.`
    );
    if (!confirmed) return;

    await fetch("/api/admin/knowledge/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: doc.documentId, businessId }),
    });
    setDocuments((prev) => prev?.filter((d) => d.documentId !== doc.documentId) ?? prev);
  }

  /** Re-embeds every chunk this business has that's missing a vector
   * from just this one provider — for fixing a provider that's behind
   * or was down earlier, without waiting for tomorrow's cron or
   * re-checking every other provider too. */
  async function backfillProvider(provider: string) {
    if (!businessId) return;
    setBackfilling(provider);
    setBackfillMessage("");

    try {
      const res = await fetch("/api/admin/embedding-providers/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, provider }),
      });
      const result = await res.json();

      setBackfillMessage(
        res.ok
          ? `${provider}: backfilled ${result.chunksBackfilled} chunk(s), ${result.vectorsAdded} vector(s) added.`
          : `Error: ${result.error}`
      );

      if (res.ok) {
        refreshDocuments();
      }
    } finally {
      setBackfilling(null);
    }
  }

  /** Platform-wide (not scoped to businessId — auto-heal checks every
   * business) manual trigger for the same job the every-30-minute
   * external scheduler runs. Shows the run's own result inline instead
   * of a separate history table — enough to confirm it worked without
   * building a second run-history UI next to the training pipeline's. */
  async function runAutoHeal() {
    setHealing(true);
    setHealMessage("");

    try {
      const res = await fetch("/api/admin/auto-heal/run", { method: "POST" });
      const result = await res.json();

      setHealMessage(
        res.ok
          ? `${result.status === "succeeded" ? "✅" : "❌"} Checked ${result.businessesChecked} business(es), backfilled ${result.providersBackfilled} provider(s), retried ${result.crawlTargetsRetried} crawl target(s).${result.error ? ` Error: ${result.error}` : ""}`
          : `Error: ${result.error}`
      );

      if (res.ok) {
        refreshDocuments();
        refreshTargets();
      }
    } finally {
      setHealing(false);
    }
  }

  return (
    <section>
      <h1 style={{ marginBottom: 4 }}>Knowledge Hub</h1>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Auto-heal</h3>
        <p style={subtleTextStyle}>Runs every 30 minutes automatically — fixes gaps in coverage and stuck crawls.</p>
        <button onClick={runAutoHeal} disabled={healing} style={primaryButtonStyle}>
          {healing ? "Checking…" : "Run now"}
        </button>
        {healMessage && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>{healMessage}</p>}
      </div>

      {businessId && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Daily knowledge refresh</h3>
          <p style={subtleTextStyle}>
            At this time (Bangladesh time), re-crawls every site, re-processes every uploaded document, and
            rebuilds one consolidated CSV of everything. Can take a few minutes — that's expected.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="time"
              value={scheduleHour}
              onChange={(e) => setScheduleHour(e.target.value)}
              style={{ width: 120 }}
            />
            <button onClick={saveSchedule} disabled={savingSchedule || !scheduleHour}>
              {savingSchedule ? "Saving…" : "Save time"}
            </button>
            <button onClick={runRefreshNow} disabled={refreshingNow} style={primaryButtonStyle}>
              {refreshingNow ? "Running…" : "Run now"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            Last run: {lastRunAt ? new Date(lastRunAt).toLocaleString() : "never"}
          </p>
          {refreshMessage && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{refreshMessage}</p>}

          <h4 style={{ marginBottom: 4 }}>Master CSV</h4>
          {masterCsvUpdatedAt ? (
            <>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Updated {new Date(masterCsvUpdatedAt).toLocaleString()}
              </p>
              <MasterCsvCoverage
                masterCsvUpdatedAt={masterCsvUpdatedAt}
                sourceCount={masterCsvSourceCount}
                documents={documents}
                targets={targets}
              />
              <a
                href={`/api/admin/knowledge/master-csv?businessId=${encodeURIComponent(businessId)}&download=true`}
                style={primaryButtonStyle}
              >
                Download CSV
              </a>
            </>
          ) : (
            <p style={subtleTextStyle}>Not generated yet — set a time above or click "Run now".</p>
          )}
        </div>
      )}

      <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Upload a document</h3>
      <UploadWidget businessId={businessId} onUploaded={refreshDocuments} />
      </div>

      <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Website crawler</h3>
      <p style={subtleTextStyle}>Add a site once — it re-crawls automatically every day to keep answers current.</p>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ flex: 1 }}
          placeholder="https://client-site.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addSite();
          }}
        />
        <button onClick={addSite} disabled={adding} style={primaryButtonStyle}>
          {adding ? "Queuing…" : "Add & crawl"}
        </button>
      </div>

      {crawlMessage && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{crawlMessage}</p>}

      {targets && targets.length > 0 && (
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead>
            <tr>
              <th style={cellStyle}>URL</th>
              <th style={cellStyle}>Progress</th>
              <th style={cellStyle}>Last crawled</th>
              <th style={cellStyle}>Pages / chunks</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id}>
                <td style={cellStyle}>{t.url}</td>
                <td style={cellStyle}>
                  <CrawlProgress target={t} />
                </td>
                <td style={cellStyle}>
                  {t.lastCrawledAt ? new Date(t.lastCrawledAt).toLocaleString() : "never"}
                </td>
                <td style={cellStyle}>
                  {t.lastPageCount ?? "—"} / {t.lastChunkCount ?? "—"}
                </td>
                <td style={cellStyle}>
                  <button
                    onClick={() => recrawl(t.id)}
                    disabled={ACTIVE_STATUSES.has(t.status)}
                  >
                    Recrawl now
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      </div>

      <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Indexed documents</h3>

      {!documents && <p style={subtleTextStyle}>Loading…</p>}

      {documents && (
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle}>Filename</th>
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}>Chunks</th>
              <th style={cellStyle}>Last updated</th>
              <th style={cellStyle}>Document ID</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {documents.slice(docPage * DOCS_PER_PAGE, (docPage + 1) * DOCS_PER_PAGE).map((d) => (
              <Fragment key={d.documentId}>
                <tr>
                  <td style={cellStyle}>{d.filename}</td>
                  <td style={cellStyle}>
                    <DocumentStatus status={d.status} lastCrawledAt={d.lastCrawledAt} />
                  </td>
                  <td style={cellStyle}>{d.chunks}</td>
                  <td style={cellStyle}>
                    {d.lastUpdated ? new Date(d.lastUpdated).toLocaleString() : "—"}
                  </td>
                  <td style={cellStyle}>
                    <code style={{ fontSize: 11 }}>{d.documentId}</code>
                  </td>
                  <td style={cellStyle}>
                    <button onClick={() => toggleChunks(d.documentId)} style={{ marginRight: 6 }}>
                      {expandedDocId === d.documentId ? "Hide data" : "View data"}
                    </button>
                    <button onClick={() => deleteDocument(d)}>Delete</button>
                  </td>
                </tr>
                {expandedDocId === d.documentId && (
                  <tr>
                    <td style={cellStyle} colSpan={6}>
                      {loadingChunks && !chunksCache[d.documentId] ? (
                        <p style={subtleTextStyle}>Loading…</p>
                      ) : (
                        <DocumentChunksView chunks={chunksCache[d.documentId] ?? []} />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {documents.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={6}>
                  Nothing indexed yet — upload a file or crawl a site above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
      {documents && documents.length > DOCS_PER_PAGE && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={() => setDocPage((p) => Math.max(0, p - 1))} disabled={docPage === 0}>
            ← Previous
          </button>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {docPage * DOCS_PER_PAGE + 1}–{Math.min((docPage + 1) * DOCS_PER_PAGE, documents.length)} of {documents.length}
          </span>
          <button
            onClick={() => setDocPage((p) => (((p + 1) * DOCS_PER_PAGE < documents.length) ? p + 1 : p))}
            disabled={(docPage + 1) * DOCS_PER_PAGE >= documents.length}
          >
            Next 10 →
          </button>
        </div>
      )}
      </div>

      {businessId && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Embedding coverage by provider</h3>
          <p style={subtleTextStyle}>100% means every chunk has a vector from that provider.</p>
          {backfillMessage && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{backfillMessage}</p>}
          {!coverage && <p style={subtleTextStyle}>Loading…</p>}
          {coverage && (
            <div className="table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={cellStyle}>Provider</th>
                  <th style={cellStyle}>Enabled</th>
                  <th style={cellStyle}>Healthy</th>
                  <th style={cellStyle}>Has key</th>
                  <th style={cellStyle}>Chunks embedded</th>
                  <th style={cellStyle}>Coverage</th>
                  <th style={cellStyle}>Reason if incomplete</th>
                  <th style={cellStyle}>Last indexed</th>
                  <th style={cellStyle}></th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((c) => {
                  const pct = c.totalChunks === 0 ? 100 : Math.round((c.chunksEmbedded / c.totalChunks) * 100);
                  const reason = coverageGapReason(c, pct);
                  return (
                    <tr key={c.provider}>
                      <td style={cellStyle}>{c.provider}</td>
                      <td style={cellStyle}>{c.enabled ? "🟢 On" : "⚪ Off"}</td>
                      <td style={cellStyle}>{c.healthy ? "✅" : "❌"}</td>
                      <td style={cellStyle}>{c.hasUsableKey ? "✅" : "❌"}</td>
                      <td style={cellStyle}>
                        {c.chunksEmbedded} / {c.totalChunks}
                      </td>
                      <td style={cellStyle}>
                        {pct === 100 ? "✅ 100%" : `⚠️ ${pct}%`}
                      </td>
                      <td style={cellStyle}>{reason ?? "—"}</td>
                      <td style={cellStyle}>
                        {c.lastIndexedAt ? new Date(c.lastIndexedAt).toLocaleString() : "—"}
                      </td>
                      <td style={cellStyle}>
                        {pct < 100 && (
                          <button
                            onClick={() => backfillProvider(c.provider)}
                            disabled={backfilling === c.provider}
                          >
                            {backfilling === c.provider ? "Backfilling…" : "Backfill"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {coverage.length === 0 && (
                  <tr>
                    <td style={cellStyle} colSpan={9}>
                      No embedding providers registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const TABULAR_METHODS = new Set(["llm-extracted", "caller-tabular"]);

/** Chunk text from chunkTabularRows is "Header: Value" lines — parses it
 * back into a row object. Splits on the FIRST ": " only, so a value that
 * contains its own colon (e.g. "Hours: 9am - 5pm") still parses
 * correctly instead of getting truncated at the wrong colon. */
function parseTabularChunk(text: string): Record<string, string> {
  const row: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(": ");
    if (idx === -1) continue;
    row[line.slice(0, idx)] = line.slice(idx + 2);
  }
  return row;
}

/** A single document can now contain BOTH tabular chunks (from LLM
 * extraction or a real CSV/XLSX upload) and plain char-chunked prose at
 * once — extraction is additive, never a replacement, so nothing on the
 * source page/document is ever silently dropped from indexing. Renders
 * each kind the way it's actually useful to look at: a real table for
 * tabular data, plain text blocks for prose. */
function DocumentChunksView({ chunks }: { chunks: DocumentChunk[] }) {
  if (chunks.length === 0) {
    return <p style={subtleTextStyle}>No chunks found.</p>;
  }

  const tabularChunks = chunks.filter((c) => c.chunkingMethod && TABULAR_METHODS.has(c.chunkingMethod));
  const textChunks = chunks.filter((c) => !c.chunkingMethod || !TABULAR_METHODS.has(c.chunkingMethod));

  const rows = tabularChunks.map((c) => parseTabularChunk(c.text));
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {rows.length > 0 && (
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
            AI-structured data ({rows.length} row{rows.length === 1 ? "" : "s"})
          </div>
          <div className="table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} style={cellStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {headers.map((h) => (
                      <td key={h} style={cellStyle}>{row[h] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {textChunks.length > 0 && (
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
            Plain text chunks ({textChunks.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
            {textChunks.map((c) => (
              <div key={c.chunkId} style={{ fontSize: 12, padding: 8, border: "1px solid var(--border)", borderRadius: 6 }}>
                {c.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Answers the question a "trust me" timestamp can't: does this CSV
 * actually cover everything currently indexed, right now, at a glance —
 * not "does the code claim it ran". Counts "# Source: " section headers
 * in the CSV itself against the indexed-documents list (same per-document
 * granularity buildCsv() groups by), and flags any document or crawl
 * target that changed AFTER the CSV was last built. */
function MasterCsvCoverage({
  masterCsvUpdatedAt,
  sourceCount,
  documents,
  targets,
}: {
  masterCsvUpdatedAt: string;
  sourceCount: number;
  documents: KnowledgeDocument[] | null;
  targets: CrawlTarget[] | null;
}) {
  const totalDocuments = documents?.length ?? 0;
  const csvBuiltAt = new Date(masterCsvUpdatedAt).getTime();

  const staleDocs = (documents ?? []).filter(
    (d) => d.lastUpdated && new Date(d.lastUpdated).getTime() > csvBuiltAt
  ).length;

  const stuckTargets = (targets ?? []).filter(
    (t) => t.status === "crawling" && Date.now() - new Date(t.updatedAt).getTime() > STUCK_CRAWLING_MS
  ).length;

  const incompleteTargets = (targets ?? []).filter((t) => t.status !== "done").length;

  const ok = staleDocs === 0 && stuckTargets === 0 && incompleteTargets === 0 && sourceCount >= totalDocuments;

  return (
    <p style={{ fontSize: 12, marginTop: 4, color: ok ? "var(--success, #15803d)" : "var(--warning, #b45309)" }}>
      {ok ? "✅" : "⚠️"} Covers {sourceCount} of {totalDocuments} indexed document(s)
      {staleDocs > 0 && ` — ${staleDocs} document(s) changed since this was built`}
      {stuckTargets > 0 && ` — ${stuckTargets} crawl target(s) stuck (auto-heal retries automatically)`}
      {incompleteTargets > 0 && stuckTargets === 0 && ` — ${incompleteTargets} crawl target(s) not yet done`}
      {!ok && ` — click "Run now" above to refresh`}
    </p>
  );
}

function CrawlProgress({ target }: { target: CrawlTarget }) {
  if (target.status === "error") {
    return <span title={target.lastError ?? ""}>❌ {target.lastError}</span>;
  }

  if (target.status === "done") {
    return <span>✅ complete</span>;
  }

  if (target.status === "queued") {
    return <span style={{ opacity: 0.6 }}>queued…</span>;
  }

  // "crawling" — inspected the site first (pagesEstimated), now filling
  // the bar in as pages are actually crawled.
  const total = target.pagesEstimated ?? 1;
  const pct = Math.min(100, Math.round((target.pagesDone / total) * 100));
  const stuck = Date.now() - new Date(target.updatedAt).getTime() > STUCK_CRAWLING_MS;

  if (stuck) {
    return (
      <span style={{ color: "var(--warning, #b45309)" }} title="No progress in 15+ minutes — auto-heal will retry this automatically within 30 minutes, or click Recrawl now.">
        ⚠️ stuck at {target.pagesDone}/{total} — auto-heal will retry
      </span>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, background: "var(--border)", borderRadius: 4, height: 8, minWidth: 80 }}>
        <div
          style={{
            width: `${pct}%`,
            background: "var(--success)",
            height: "100%",
            borderRadius: 4,
            transition: "width 0.3s",
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {target.pagesDone}/{total} ({pct}%)
      </span>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  new: "🆕 new",
  updated: "🔄 updated",
  unchanged: "✅ unchanged",
  uploaded: "📄 uploaded",
};

function DocumentStatus({
  status,
  lastCrawledAt,
}: {
  status: string;
  lastCrawledAt: string | null;
}) {
  return (
    <span title={lastCrawledAt ? `Last crawled ${new Date(lastCrawledAt).toLocaleString()}` : undefined}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
