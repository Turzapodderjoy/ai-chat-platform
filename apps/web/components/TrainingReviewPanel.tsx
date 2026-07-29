"use client";

import { Fragment, useEffect, useState } from "react";

import { cardStyle, cellStyle } from "./dashboard-styles";

interface ChatAnalysis {
  id: string;
  conversationId: string;
  businessId: string;
  verdict: string;
  findings: string;
  createdAt: string;
}

interface PromptSuggestion {
  id: string;
  businessId: string;
  source: string;
  kind: string;
  proposedSystemPrompt: string | null;
  proposedAppendText: string | null;
  reasoning: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
}

interface RunSuggestion {
  id: string;
  businessId: string;
  kind: string;
  proposedAppendText: string | null;
  proposedSystemPrompt: string | null;
  reasoning: string;
  status: string;
}

interface PipelineRun {
  id: string;
  triggeredBy: "cron" | "manual";
  startedAt: string;
  finishedAt: string | null;
  conversationsProcessed: number;
  kept: number;
  dropped: number;
  failed: number;
  businessesChecked: number;
  suggestionsCreated: number;
  suggestions: RunSuggestion[];
}

interface QaFeedback {
  messageId: string;
  businessId: string;
  verdict: "pass" | "fail";
  note: string | null;
  createdAt: string;
  messageContent: string;
  processed: boolean;
  analysisVerdict: string | null;
  analysisFindings: string | null;
}

const VERDICT_LABEL: Record<string, string> = {
  kept: "✅ Kept",
  dropped_spam: "🚫 Dropped (spam)",
  dropped_irrelevant: "⚪ Dropped (irrelevant)",
  dropped_harmful: "⛔ Dropped (harmful)",
};

const SOURCE_LABEL: Record<string, string> = {
  pipeline: "⏰ Pipeline",
  training_arena: "🥊 Training Arena",
  dumped_chat: "📋 Dumped chat",
};

interface TrainingReviewPanelProps {
  /** Omit on the mother dashboard to see every business at once (with a
   * Client column and "Accept to all clients" for platform-scoped
   * suggestions). Pass a client's id to see only that business, with
   * plain single-business accept only, and no global "Run now" trigger
   * (the pipeline runs across every business in one pass — there's no
   * per-business equivalent to trigger). */
  businessId?: string;
  broadcast?: boolean;
}

/**
 * Consolidated review surface — merges the old Training & Insights panel
 * (run history, pending/decided suggestions, findings log) and QA Review
 * panel (per-message pass/fail feedback linked to its analysis) into one
 * place, plus what's new: a source badge per suggestion (pipeline / live
 * arena / dumped chat) and a "Refine & resubmit" flow for feedback that
 * doesn't warrant an outright Accept or Decline.
 */
export function TrainingReviewPanel({ businessId, broadcast = false }: TrainingReviewPanelProps) {
  const [analyses, setAnalyses] = useState<ChatAnalysis[] | null>(null);
  const [pending, setPending] = useState<PromptSuggestion[] | null>(null);
  const [decided, setDecided] = useState<PromptSuggestion[] | null>(null);
  const [runs, setRuns] = useState<PipelineRun[] | null>(null);
  const [feedback, setFeedback] = useState<QaFeedback[] | null>(null);

  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null);
  const [expandedSuggestionId, setExpandedSuggestionId] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);
  const [expandedDecidedId, setExpandedDecidedId] = useState<string | null>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [refineFeedback, setRefineFeedback] = useState("");

  const [deciding, setDeciding] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const suggestionQs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
  const scopeQs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";

  function refresh() {
    fetch(`/api/admin/training/analyses${scopeQs}`)
      .then((r) => r.json())
      .then((data) => setAnalyses(data.analyses));

    fetch(`/api/admin/training/suggestions${suggestionQs}`)
      .then((r) => r.json())
      .then((data) => {
        setPending(data.pending);
        setDecided(data.decided);
      });

    fetch(`/api/admin/qa-feedback${scopeQs}`)
      .then((r) => r.json())
      .then((data) => setFeedback(data.feedback));

    if (!businessId) {
      fetch("/api/admin/training/runs")
        .then((r) => r.json())
        .then((data) => setRuns(data.runs));
    }
  }

  useEffect(refresh, [businessId]);

  async function runNow() {
    setRunning(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/training/run", { method: "POST" });
      const result = await res.json();

      setMessage(
        res.ok
          ? `Run complete — analyzed ${result.analysis.processed} conversation(s) (${result.analysis.kept} kept), ${result.suggestions.suggestionsCreated} new suggestion(s) created.`
          : `Error: ${result.error}`
      );

      if (res.ok) {
        refresh();
      }
    } finally {
      setRunning(false);
    }
  }

  async function decide(s: PromptSuggestion, action: "accept" | "decline") {
    setDeciding(s.id);
    setMessage("");

    try {
      const endpoint =
        action === "decline" ? "decline" : broadcast && s.businessId === "__platform__" ? "broadcast-accept" : "accept";

      const res = await fetch(`/api/admin/training/suggestions/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id }),
      });
      const result = await res.json();

      setMessage(
        res.ok
          ? action === "accept"
            ? endpoint === "broadcast-accept"
              ? `Accepted — pushed to the platform default and ${result.businessIds.length - 1} client(s).`
              : "Accepted — a new AI Brain version was created for this client."
            : "Declined — the live prompt is unchanged."
          : `Error: ${result.error}`
      );

      if (res.ok) {
        refresh();
      }
    } finally {
      setDeciding(null);
    }
  }

  async function submitRefine(id: string) {
    if (!refineFeedback.trim()) return;
    setDeciding(id);
    setMessage("");

    try {
      const res = await fetch("/api/admin/training/suggestions/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, additionalFeedback: refineFeedback }),
      });
      const result = await res.json();

      setMessage(res.ok ? "Refined — the original was superseded by a new revised suggestion." : `Error: ${result.error}`);

      if (res.ok) {
        setRefiningId(null);
        setRefineFeedback("");
        refresh();
      }
    } finally {
      setDeciding(null);
    }
  }

  return (
    <section>
      <h1 style={{ marginBottom: 4 }}>Training Review</h1>
      <p style={{ opacity: 0.6 }}>
        Every proposed AI Brain change lands here for review, however it was
        produced — the daily pipeline, a Training Arena session, or a
        dumped chat — nothing is ever applied automatically. Accept, Decline,
        or leave feedback and Refine for another pass.
      </p>

      {!businessId && (
        <>
          <button onClick={runNow} disabled={running}>
            {running ? "Running… (this can take a minute)" : "Run now"}
          </button>
        </>
      )}
      {message && <p style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>{message}</p>}

      {!businessId && (
        <div style={{ ...cardStyle, marginTop: 20 }}>
          <h3 style={{ marginTop: 0 }}>Run history</h3>
          <p style={{ opacity: 0.6 }}>
            Every time the pipeline has run (scheduled or manual), with what
            it did and any suggestions that run produced.
          </p>
          {!runs && <p>Loading…</p>}
          {runs && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={cellStyle}>When</th>
                  <th style={cellStyle}>Trigger</th>
                  <th style={cellStyle}>Status</th>
                  <th style={cellStyle}>Conversations</th>
                  <th style={cellStyle}>Suggestions</th>
                  <th style={cellStyle}></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td style={cellStyle}>{new Date(r.startedAt).toLocaleString()}</td>
                      <td style={cellStyle}>{r.triggeredBy === "manual" ? "👤 Manual" : "⏰ Scheduled"}</td>
                      <td style={cellStyle}>
                        {r.finishedAt
                          ? `✅ Done (${r.kept} kept, ${r.dropped} dropped, ${r.failed} failed)`
                          : "⏳ Running…"}
                      </td>
                      <td style={cellStyle}>{r.conversationsProcessed}</td>
                      <td style={cellStyle}>{r.suggestionsCreated}</td>
                      <td style={cellStyle}>
                        {r.suggestions.length > 0 && (
                          <button onClick={() => setExpandedRunId(expandedRunId === r.id ? null : r.id)}>
                            {expandedRunId === r.id ? "Hide" : "View suggestions"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedRunId === r.id && (
                      <tr>
                        <td style={cellStyle} colSpan={6}>
                          {r.suggestions.map((s) => (
                            <div key={s.id} style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 12, opacity: 0.7 }}>
                                <code>{s.businessId}</code> · {s.kind} ·{" "}
                                {s.status === "pending" ? "⏳ pending" : s.status === "accepted" ? "✅ accepted" : "❌ declined"}
                              </div>
                              <div style={{ fontSize: 12, marginTop: 2 }}>{s.reasoning}</div>
                              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: "4px 0 0" }}>
                                {s.proposedAppendText ?? s.proposedSystemPrompt}
                              </pre>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td style={cellStyle} colSpan={6}>
                      No runs yet — click Run now above, or wait for the 5:00am BST cron.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Pending suggestions</h3>
        <p style={{ opacity: 0.6 }}>
          Every source piles up here in one queue — the nightly pipeline
          scanning the whole conversation database, Training Arena live
          sessions, and dumped chats — each tagged with where it came from
          and the full reasoning behind it.
        </p>
        {!pending && <p>Loading…</p>}
        {pending && pending.length === 0 && <p style={{ opacity: 0.6 }}>No pending suggestions right now.</p>}
        {pending && pending.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {!businessId && <th style={cellStyle}>Client</th>}
                <th style={cellStyle}>Source</th>
                <th style={cellStyle}>Reasoning</th>
                <th style={cellStyle}>When</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((s) => (
                <Fragment key={s.id}>
                  <tr>
                    {!businessId && (
                      <td style={cellStyle}>
                        <code style={{ fontSize: 11 }}>{s.businessId}</code>
                      </td>
                    )}
                    <td style={cellStyle}>{SOURCE_LABEL[s.source] ?? s.source}</td>
                    <td style={cellStyle}>{s.reasoning}</td>
                    <td style={cellStyle}>{new Date(s.createdAt).toLocaleString()}</td>
                    <td style={cellStyle}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => setExpandedSuggestionId(expandedSuggestionId === s.id ? null : s.id)}>
                          {expandedSuggestionId === s.id ? "Hide" : "View change"}
                        </button>
                        <button onClick={() => decide(s, "accept")} disabled={deciding === s.id}>
                          {deciding === s.id
                            ? "…"
                            : broadcast && s.businessId === "__platform__"
                              ? "Accept to all clients"
                              : "Accept"}
                        </button>
                        <button onClick={() => decide(s, "decline")} disabled={deciding === s.id}>
                          {deciding === s.id ? "…" : "Decline"}
                        </button>
                        <button onClick={() => setRefiningId(refiningId === s.id ? null : s.id)}>
                          {refiningId === s.id ? "Cancel" : "Refine"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedSuggestionId === s.id && (
                    <tr>
                      <td style={cellStyle} colSpan={businessId ? 4 : 5}>
                        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>
                          {s.kind === "append" ? s.proposedAppendText : s.proposedSystemPrompt}
                        </pre>
                      </td>
                    </tr>
                  )}
                  {refiningId === s.id && (
                    <tr>
                      <td style={cellStyle} colSpan={businessId ? 4 : 5}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            style={{ flex: 1, padding: 8 }}
                            placeholder="What should be different about this suggestion?"
                            value={refineFeedback}
                            onChange={(e) => setRefineFeedback(e.target.value)}
                          />
                          <button onClick={() => submitRefine(s.id)} disabled={deciding === s.id}>
                            {deciding === s.id ? "…" : "Resubmit"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Decided history</h3>
        <p style={{ opacity: 0.6 }}>
          Every suggestion once it's been decided — expand a row to see
          exactly what was improved (the reasoning) and how it was
          hardcoded into the prompt (the literal text that was applied).
        </p>
        {!decided && <p>Loading…</p>}
        {decided && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {!businessId && <th style={cellStyle}>Client</th>}
                <th style={cellStyle}>Source</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Decided</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {decided.map((s) => (
                <Fragment key={s.id}>
                  <tr>
                    {!businessId && (
                      <td style={cellStyle}>
                        <code style={{ fontSize: 11 }}>{s.businessId}</code>
                      </td>
                    )}
                    <td style={cellStyle}>{SOURCE_LABEL[s.source] ?? s.source}</td>
                    <td style={cellStyle}>
                      {s.status === "accepted" ? "✅ Accepted" : s.status === "declined" ? "❌ Declined" : "♻️ Superseded"}
                    </td>
                    <td style={cellStyle}>{s.decidedAt ? new Date(s.decidedAt).toLocaleString() : "—"}</td>
                    <td style={cellStyle}>
                      <button onClick={() => setExpandedDecidedId(expandedDecidedId === s.id ? null : s.id)}>
                        {expandedDecidedId === s.id ? "Hide" : "View detail"}
                      </button>
                    </td>
                  </tr>
                  {expandedDecidedId === s.id && (
                    <tr>
                      <td style={cellStyle} colSpan={businessId ? 4 : 5}>
                        <p style={{ fontSize: 13, margin: "0 0 6px" }}>
                          <strong>What was improved:</strong> {s.reasoning}
                        </p>
                        {s.status === "accepted" ? (
                          <>
                            <p style={{ fontSize: 13, margin: "0 0 4px" }}>
                              <strong>
                                How it was hardcoded:
                              </strong>{" "}
                              {s.kind === "append"
                                ? `appended to the end of the AI Brain system prompt for ${s.businessId === "__platform__" ? "the platform default" : "this client"}, as a new AiConfigVersion row.`
                                : "used to fully replace the AI Brain system prompt, as a new AiConfigVersion row."}
                            </p>
                            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 4, margin: 0 }}>
                              {s.kind === "append" ? s.proposedAppendText : s.proposedSystemPrompt}
                            </pre>
                          </>
                        ) : s.status === "declined" ? (
                          <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>
                            Declined — the prompt was left unchanged. Proposed text:
                            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: "4px 0 0" }}>
                              {s.kind === "append" ? s.proposedAppendText : s.proposedSystemPrompt}
                            </pre>
                          </p>
                        ) : (
                          <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>
                            Superseded by a refined suggestion after reviewer feedback — this version was never applied. Original proposed text:
                            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: "4px 0 0" }}>
                              {s.kind === "append" ? s.proposedAppendText : s.proposedSystemPrompt}
                            </pre>
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {decided.length === 0 && (
                <tr>
                  <td style={cellStyle} colSpan={businessId ? 4 : 5}>
                    No decisions made yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>QA feedback</h3>
        <p style={{ opacity: 0.6 }}>
          Every Pass/Fail submitted from Training Arena sessions, with
          whether the pipeline has processed that conversation yet.
        </p>
        {!feedback && <p>Loading…</p>}
        {feedback && feedback.length === 0 && <p style={{ opacity: 0.6 }}>No QA feedback yet.</p>}
        {feedback && feedback.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {!businessId && <th style={cellStyle}>Client</th>}
                <th style={cellStyle}>Verdict</th>
                <th style={cellStyle}>Response</th>
                <th style={cellStyle}>Note</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>When</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {feedback.map((f) => (
                <Fragment key={f.messageId}>
                  <tr>
                    {!businessId && (
                      <td style={cellStyle}>
                        <code style={{ fontSize: 11 }}>{f.businessId}</code>
                      </td>
                    )}
                    <td style={cellStyle}>{f.verdict === "pass" ? "✓ Pass" : "✗ Fail"}</td>
                    <td style={cellStyle}>
                      {f.messageContent.length > 80 ? `${f.messageContent.slice(0, 80)}…` : f.messageContent}
                    </td>
                    <td style={cellStyle}>{f.note ?? "—"}</td>
                    <td style={cellStyle}>
                      {f.processed
                        ? `✅ Processed — ${VERDICT_LABEL[f.analysisVerdict ?? ""] ?? f.analysisVerdict}`
                        : "⏳ Not processed yet"}
                    </td>
                    <td style={cellStyle}>{new Date(f.createdAt).toLocaleString()}</td>
                    <td style={cellStyle}>
                      {f.processed && (
                        <button onClick={() => setExpandedFeedbackId(expandedFeedbackId === f.messageId ? null : f.messageId)}>
                          {expandedFeedbackId === f.messageId ? "Hide" : "View findings"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedFeedbackId === f.messageId && (
                    <tr>
                      <td style={cellStyle} colSpan={businessId ? 6 : 7}>
                        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>{f.analysisFindings}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Findings log</h3>
        <p style={{ opacity: 0.6 }}>Every conversation the pipeline has analyzed, kept or dropped — the full human-readable audit trail.</p>
        {!analyses && <p>Loading…</p>}
        {analyses && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {!businessId && <th style={cellStyle}>Client</th>}
                <th style={cellStyle}>Verdict</th>
                <th style={cellStyle}>Findings</th>
                <th style={cellStyle}>When</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {analyses.map((a) => (
                <Fragment key={a.id}>
                  <tr>
                    {!businessId && (
                      <td style={cellStyle}>
                        <code style={{ fontSize: 11 }}>{a.businessId}</code>
                      </td>
                    )}
                    <td style={cellStyle}>{VERDICT_LABEL[a.verdict] ?? a.verdict}</td>
                    <td style={cellStyle}>{a.findings.length > 120 ? `${a.findings.slice(0, 120)}…` : a.findings}</td>
                    <td style={cellStyle}>{new Date(a.createdAt).toLocaleString()}</td>
                    <td style={cellStyle}>
                      <button onClick={() => setExpandedAnalysisId(expandedAnalysisId === a.id ? null : a.id)}>
                        {expandedAnalysisId === a.id ? "Hide" : "Full text"}
                      </button>
                    </td>
                  </tr>
                  {expandedAnalysisId === a.id && (
                    <tr>
                      <td style={cellStyle} colSpan={businessId ? 4 : 5}>
                        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>{a.findings}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {analyses.length === 0 && (
                <tr>
                  <td style={cellStyle} colSpan={businessId ? 4 : 5}>
                    Nothing analyzed yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
