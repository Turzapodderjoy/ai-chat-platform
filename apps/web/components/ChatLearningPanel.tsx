"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, badgeStyle, primaryButtonStyle } from "./dashboard-styles";
import { MarkdownMessage } from "./MarkdownMessage";

interface ConversationSummary {
  id: string;
  businessId: string;
  channel: string;
  handoffStatus: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
}

interface Review {
  conversationId: string;
  businessId: string;
  decision: "add" | "drop" | null;
  qaVerdict: "pass" | "fail" | null;
  qaNote: string | null;
  analyzedAt: string | null;
}

interface Message {
  id: string;
  role: "system" | "user" | "assistant" | "agent";
  content: string;
  createdAt: string;
}

interface MessageFeedback {
  messageId: string;
  verdict: "pass" | "fail";
  note: string | null;
}

interface AnalysisRun {
  id: string;
  businessId: string;
  conversationIds: string[];
  report: string;
  createdAt: string;
}

/** Fully manual replacement for the old Training Review panel — no LLM
 * decides anything here. Browse every real chat (customer conversations
 * plus Training Arena sessions, in one list), mark each "add"/"drop" and
 * pass/fail + note (both per-chat and per-message), then run one batch
 * Gemini analysis over everything currently marked "add". The report is
 * read-only findings — go write the actual AI Brain prompt change
 * yourself in the AI Brain tab. */
export function ChatLearningPanel({ businessId }: { businessId?: string }) {
  const qs = businessId ? `businessId=${encodeURIComponent(businessId)}` : "";

  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [savingReview, setSavingReview] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, MessageFeedback>>({});

  const [qaNoteDraft, setQaNoteDraft] = useState("");

  const [runs, setRuns] = useState<AnalysisRun[] | null>(null);
  const [running, setRunning] = useState(false);
  const [latestReport, setLatestReport] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  function refreshConversations() {
    fetch(`/api/admin/conversations?${qs}${qs ? "&" : ""}includeTraining=true&sort=newest`)
      .then((r) => r.json())
      .then((data) => {
        setConversations(data.conversations);
        setNextCursor(data.nextCursor);
      });
  }

  function refreshReviews() {
    fetch(`/api/admin/training/reviews?${qs}`)
      .then((r) => r.json())
      .then((data: { reviews: Review[] }) => {
        setReviews(Object.fromEntries(data.reviews.map((r) => [r.conversationId, r])));
      });
  }

  function refreshRuns() {
    fetch(`/api/admin/training/analysis-runs?${qs}`)
      .then((r) => r.json())
      .then((data: { runs: AnalysisRun[] }) => setRuns(data.runs));
  }

  function refreshMessageFeedback() {
    fetch(`/api/admin/qa-feedback?${qs}`)
      .then((r) => r.json())
      .then((data: { feedback: MessageFeedback[] }) => {
        setMessageFeedback(Object.fromEntries(data.feedback.map((f) => [f.messageId, f])));
      });
  }

  useEffect(() => {
    refreshConversations();
    refreshReviews();
    refreshRuns();
    refreshMessageFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/conversations?${qs}${qs ? "&" : ""}includeTraining=true&sort=newest&cursor=${nextCursor}`);
      const data = await res.json();
      setConversations((prev) => [...(prev ?? []), ...data.conversations]);
      setNextCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function reviewFor(conversationId: string): Review {
    return reviews[conversationId] ?? { conversationId, businessId: businessId ?? "", decision: null, qaVerdict: null, qaNote: null, analyzedAt: null };
  }

  async function setDecision(conversationId: string, decision: "add" | "drop" | null) {
    setSavingReview(conversationId);
    try {
      await fetch("/api/admin/training/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, businessId, decision }),
      });
      refreshReviews();
    } finally {
      setSavingReview(null);
    }
  }

  async function setChatQa(conversationId: string, qaVerdict: "pass" | "fail" | null, qaNote: string | null) {
    setSavingReview(conversationId);
    try {
      await fetch("/api/admin/training/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, businessId, qaVerdict, qaNote }),
      });
      refreshReviews();
    } finally {
      setSavingReview(null);
    }
  }

  function openConversation(id: string) {
    setSelectedId(id);
    setMessages(null);
    const review = reviewFor(id);
    setQaNoteDraft(review.qaNote ?? "");
    fetch(`/api/chat/messages?sessionId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []));
  }

  async function setMessageQa(messageId: string, verdict: "pass" | "fail", note?: string) {
    if (!businessId) return;
    await fetch("/api/chat/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, businessId, verdict, note }),
    });
    refreshMessageFeedback();
  }

  const addCount = useMemo(
    () => Object.values(reviews).filter((r) => r.decision === "add" && !r.analyzedAt).length,
    [reviews]
  );

  async function runAnalysis() {
    const conversationIds = Object.values(reviews)
      .filter((r) => r.decision === "add" && !r.analyzedAt)
      .map((r) => r.conversationId);

    if (conversationIds.length === 0) return;

    setRunning(true);
    setLatestReport(null);
    try {
      const res = await fetch("/api/admin/training/analysis-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, conversationIds }),
      });
      const data = await res.json();

      if (res.ok) {
        setLatestReport(data.report);
        refreshReviews();
        refreshRuns();
      } else {
        setLatestReport(`Error: ${data.error}`);
      }
    } finally {
      setRunning(false);
    }
  }

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;
  const selectedReview = selectedId ? reviewFor(selectedId) : null;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Chat Learning</h2>
      <p style={subtleTextStyle}>
        Decide which chats are worth training on, leave pass/fail feedback, then run one Gemini analysis over
        everything you&apos;ve marked &quot;Add&quot;. Nothing here writes to the AI Brain automatically — read the
        report and edit the prompt yourself.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
        <button onClick={runAnalysis} disabled={running || addCount === 0} style={primaryButtonStyle}>
          {running ? "Analyzing…" : `Run AI Analysis (${addCount})`}
        </button>
        {!businessId && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Platform-wide batch</span>}
      </div>

      {latestReport && (
        <div style={{ ...cardStyle, background: "var(--surface)", marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Latest report</h3>
          <p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{latestReport}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ width: 320, flexShrink: 0, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", maxHeight: 560, overflowY: "auto" }}>
          {!conversations && <p style={{ padding: 10, ...subtleTextStyle }}>Loading…</p>}
          {conversations?.length === 0 && <p style={{ padding: 10, ...subtleTextStyle }}>No chats yet.</p>}
          {conversations?.map((c) => {
            const review = reviewFor(c.id);
            return (
              <div
                key={c.id}
                onClick={() => openConversation(c.id)}
                style={{
                  padding: 10,
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  background: selectedId === c.id ? "var(--surface-hover)" : "transparent",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>{c.channel}</span>
                  <span style={{ color: "var(--text-muted)" }}>{new Date(c.updatedAt).toLocaleDateString()}</span>
                </div>
                {c.lastMessage && (
                  <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>
                    {c.lastMessage.length > 55 ? `${c.lastMessage.slice(0, 55)}…` : c.lastMessage}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDecision(c.id, review.decision === "add" ? null : "add");
                    }}
                    disabled={savingReview === c.id}
                    style={review.decision === "add" ? { ...primaryButtonStyle, fontSize: 11, padding: "3px 8px" } : { fontSize: 11, padding: "3px 8px" }}
                  >
                    Add
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDecision(c.id, review.decision === "drop" ? null : "drop");
                    }}
                    disabled={savingReview === c.id}
                    style={{ fontSize: 11, padding: "3px 8px", ...(review.decision === "drop" ? { borderColor: "var(--danger)", color: "var(--danger)" } : {}) }}
                  >
                    Drop
                  </button>
                  {review.qaVerdict && <span style={{ ...badgeStyle(review.qaVerdict === "pass" ? "ok" : "error"), fontSize: 10 }}>{review.qaVerdict}</span>}
                  {review.analyzedAt && <span style={badgeStyle("info")}>analyzed</span>}
                </div>
              </div>
            );
          })}
          {nextCursor && (
            <div style={{ padding: 10 }}>
              <button onClick={loadMore} disabled={loadingMore} style={{ width: "100%" }}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {!selected && <p style={subtleTextStyle}>Select a chat to review it.</p>}
          {selected && selectedReview && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13 }}>
                  {selected.channel} · <code style={{ fontSize: 11 }}>{selected.id}</code>
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>This chat:</span>
                <button
                  onClick={() => setChatQa(selected.id, selectedReview.qaVerdict === "pass" ? null : "pass", qaNoteDraft || null)}
                  style={selectedReview.qaVerdict === "pass" ? { ...primaryButtonStyle } : {}}
                >
                  Pass
                </button>
                <button
                  onClick={() => setChatQa(selected.id, selectedReview.qaVerdict === "fail" ? null : "fail", qaNoteDraft || null)}
                  style={selectedReview.qaVerdict === "fail" ? { borderColor: "var(--danger)", color: "var(--danger)" } : {}}
                >
                  Fail
                </button>
                <input
                  style={{ flex: 1, minWidth: 160 }}
                  placeholder="Note about this chat…"
                  value={qaNoteDraft}
                  onChange={(e) => setQaNoteDraft(e.target.value)}
                  onBlur={() => setChatQa(selected.id, selectedReview.qaVerdict, qaNoteDraft || null)}
                />
              </div>

              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", minHeight: 300, maxHeight: 420, overflowY: "auto", padding: 16 }}>
                {!messages && <p style={subtleTextStyle}>Loading…</p>}
                {messages?.map((m) => {
                  const fb = messageFeedback[m.id];
                  return (
                    <div key={m.id} style={{ marginBottom: 12 }}>
                      <div>
                        <strong>{m.role === "user" ? "Customer" : m.role === "agent" ? "Agent" : m.role === "assistant" ? "AI" : "System"}:</strong>{" "}
                        {m.role === "user" ? m.content : <MarkdownMessage text={m.content} />}
                      </div>
                      {m.role === "assistant" && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                          <button
                            onClick={() => setMessageQa(m.id, "pass")}
                            style={{ fontSize: 11, padding: "2px 8px", ...(fb?.verdict === "pass" ? { borderColor: "var(--success)", color: "var(--success)" } : {}) }}
                          >
                            👍
                          </button>
                          <button
                            onClick={() => setMessageQa(m.id, "fail")}
                            style={{ fontSize: 11, padding: "2px 8px", ...(fb?.verdict === "fail" ? { borderColor: "var(--danger)", color: "var(--danger)" } : {}) }}
                          >
                            👎
                          </button>
                          {fb?.note && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{fb.note}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <h3 style={{ marginTop: 28 }}>Past analysis runs</h3>
      {!runs && <p style={subtleTextStyle}>Loading…</p>}
      {runs && runs.length === 0 && <p style={subtleTextStyle}>No runs yet.</p>}
      {runs && runs.length > 0 && (
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th style={cellStyle}>When</th>
              <th style={cellStyle}>Chats</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td style={cellStyle}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td style={cellStyle}>{r.conversationIds.length}</td>
                  <td style={cellStyle}>
                    <button onClick={() => setExpandedRunId(expandedRunId === r.id ? null : r.id)}>
                      {expandedRunId === r.id ? "Hide" : "View report"}
                    </button>
                  </td>
                </tr>
                {expandedRunId === r.id && (
                  <tr>
                    <td style={cellStyle} colSpan={3}>
                      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>{r.report}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
