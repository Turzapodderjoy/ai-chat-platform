"use client";

import { Fragment, useEffect, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, primaryButtonStyle } from "./dashboard-styles";

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
  training_arena: "🥊 Training Arena",
  dumped_chat: "📋 Dumped chat",
};

interface TrainingReviewPanelProps {
  /** Omit on the mother dashboard to see every business at once (with a
   * Client column and "Accept to all clients" for platform-scoped
   * suggestions). Pass a client's id to see only that business. */
  businessId?: string;
  broadcast?: boolean;
}

/**
 * Consolidated review surface for the two human-driven training paths —
 * Training Arena sessions and dumped chats — with no automatic scanning
 * of the whole conversation database. Accepting a pending suggestion here
 * IS the "force run" step: it immediately hardcodes the approved text
 * into the AI Brain prompt as a new AiConfigVersion. Also shows per-
 * message QA feedback and the analysis findings log Training Arena
 * sessions produce.
 */
export function TrainingReviewPanel({ businessId, broadcast = false }: TrainingReviewPanelProps) {
  const [analyses, setAnalyses] = useState<ChatAnalysis[] | null>(null);
  const [pending, setPending] = useState<PromptSuggestion[] | null>(null);
  const [decided, setDecided] = useState<PromptSuggestion[] | null>(null);
  const [feedback, setFeedback] = useState<QaFeedback[] | null>(null);

  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null);
  const [expandedSuggestionId, setExpandedSuggestionId] = useState<string | null>(null);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);
  const [expandedDecidedId, setExpandedDecidedId] = useState<string | null>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [refineFeedback, setRefineFeedback] = useState("");

  const [deciding, setDeciding] = useState<string | null>(null);
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
  }

  useEffect(refresh, [businessId]);

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
      <p style={subtleTextStyle}>
        Every proposed AI Brain change lands here for review — only from a
        Training Arena session or a dumped chat, both driven by explicit
        human instructions, never an automatic scan of the database.
        Nothing is applied until you decide: Accept hardcodes it into the
        prompt immediately, Decline leaves the prompt untouched, or leave
        feedback and Refine for another pass.
      </p>
      {message && <p style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>{message}</p>}

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Pending suggestions</h3>
        <p style={subtleTextStyle}>
          Every Training Arena session and dumped chat piles up here in one
          queue, tagged with where it came from and the full reasoning
          behind it. Accept is the force-run step that hardcodes it into
          the prompt.
        </p>
        {!pending && <p>Loading…</p>}
        {pending && pending.length === 0 && <p style={subtleTextStyle}>No pending suggestions right now.</p>}
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
                        <button onClick={() => decide(s, "accept")} disabled={deciding === s.id} style={primaryButtonStyle}>
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
        <p style={subtleTextStyle}>
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
        <p style={subtleTextStyle}>
          Every Pass/Fail submitted from Training Arena sessions, with
          whether that session has been analyzed yet (via "End session &amp;
          review").
        </p>
        {!feedback && <p>Loading…</p>}
        {feedback && feedback.length === 0 && <p style={subtleTextStyle}>No QA feedback yet.</p>}
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
        <p style={subtleTextStyle}>Every Training Arena session that's been reviewed, kept or dropped — the full human-readable audit trail.</p>
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
