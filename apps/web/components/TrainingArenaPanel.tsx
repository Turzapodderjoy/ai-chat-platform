"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle } from "./dashboard-styles";

interface Message {
  role: "user" | "assistant" | "agent";
  content: string;
  provider?: string;
  handoff?: boolean;
}

interface ReviewResult {
  verdict: string;
  findings: string;
  suggestion: { id: string; proposedAppendText: string; reasoning: string } | null;
}

interface SessionSummary {
  id: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
  reviewed: boolean;
}

function newSessionId(): string {
  return `training-${crypto.randomUUID()}`;
}

type Mode = "live" | "dump";

/** Intercom-style layout: a sidebar of past Training Arena sessions beside
 * the active chat/dump window. A chat box for deliberately provoking and
 * correcting the AI's real behavior (retrieval, system prompt, handoff
 * logic — the exact same pipeline a real customer hits), not a simulation.
 * The one difference: the AI keeps responding even after it hands off,
 * since the whole point is to argue with it ("why did you hand off, you
 * could have just said hello") and see how it reasons about the
 * correction. Ending a session runs it through the reasoning-LLM analysis
 * on demand, and — if there's real signal — proposes a concrete AI Brain
 * change you can review and Save or
 * Discard. "Dump a chat" mode does the same thing for a conversation that
 * already happened elsewhere: paste the transcript plus instructions
 * instead of re-enacting it live. */
export function TrainingArenaPanel({
  businessId,
  broadcast = false,
}: {
  businessId: string;
  /** Mother dashboard's Training Arena (general/platform-wide training) —
   * Save applies the fix to the platform default AND every existing
   * client at once, instead of just this one business. */
  broadcast?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("live");

  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [viewingMessages, setViewingMessages] = useState<Message[] | null>(null);

  const [sessionId, setSessionId] = useState(newSessionId());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [message, setMessage] = useState("");

  const [transcript, setTranscript] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submittingDump, setSubmittingDump] = useState(false);

  function refreshSessions() {
    fetch(`/api/admin/training/sessions?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions));
  }

  useEffect(refreshSessions, [businessId]);

  function newSession() {
    setSessionId(newSessionId());
    setMessages([]);
    setReview(null);
    setMessage("");
    setViewingSessionId(null);
    setViewingMessages(null);
  }

  async function viewSession(id: string) {
    setViewingSessionId(id);
    setViewingMessages(null);
    const res = await fetch(`/api/chat/messages?sessionId=${encodeURIComponent(id)}`);
    const data = await res.json();
    setViewingMessages(res.ok ? data.messages : []);
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, businessId }),
      });
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        res.ok
          ? { role: "assistant", content: data.answer, provider: data.provider, handoff: data.handoff }
          : { role: "assistant", content: `Error: ${data.detail ?? data.error}` },
      ]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${String(err)}` }]);
    } finally {
      setSending(false);
    }
  }

  async function endAndReview() {
    if (messages.length === 0) return;
    setReviewing(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/training/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();

      if (res.ok) {
        setReview(data);
        refreshSessions();
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } finally {
      setReviewing(false);
    }
  }

  async function submitDump() {
    if (!transcript.trim() || !instructions.trim()) return;
    setSubmittingDump(true);
    setMessage("");
    setReview(null);

    try {
      const res = await fetch("/api/admin/training/dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, transcript, instructions }),
      });
      const data = await res.json();

      if (res.ok) {
        setReview({ verdict: "kept", findings: instructions, suggestion: data });
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } finally {
      setSubmittingDump(false);
    }
  }

  async function decide(accept: boolean) {
    if (!review?.suggestion) return;
    setDeciding(true);

    try {
      const endpoint = !accept
        ? "decline"
        : broadcast
          ? "broadcast-accept"
          : "accept";

      const res = await fetch(`/api/admin/training/suggestions/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: review.suggestion.id }),
      });
      const data = await res.json();

      setMessage(
        res.ok
          ? accept
            ? broadcast
              ? `Saved — pushed to the platform default and ${data.businessIds.length - 1} client(s).`
              : "Saved — the AI Brain now has this rule."
            : "Discarded — nothing changed."
          : `Error: ${data.error}`
      );

      if (res.ok) {
        if (mode === "live") {
          newSession();
        } else {
          setReview(null);
          setTranscript("");
          setInstructions("");
        }
      }
    } finally {
      setDeciding(false);
    }
  }

  const viewingSession = viewingSessionId !== null;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Training Arena{broadcast ? " (general — applies to all clients)" : ""}</h2>
      <p style={subtleTextStyle}>
        Talk to the AI directly to provoke and correct its real behavior, or
        dump an already-completed chat with instructions instead. End a
        session (or submit a dump) to review what it learned and decide
        whether to save that as a real AI Brain rule.
        {broadcast
          ? " This is the platform-wide arena — saving here pushes the fix to the platform default AND every existing client at once."
          : ""}
      </p>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ width: 220, flexShrink: 0, border: "1px solid #333", borderRadius: 8, maxHeight: 480, overflowY: "auto" }}>
          <div style={{ padding: 10, borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 13 }}>Sessions</strong>
            <button
              onClick={() => {
                setMode("live");
                newSession();
              }}
              style={{ fontSize: 12 }}
            >
              + New
            </button>
          </div>
          {!sessions && <p style={{ padding: 10, ...subtleTextStyle }}>Loading…</p>}
          {sessions && sessions.length === 0 && <p style={{ padding: 10, ...subtleTextStyle }}>No sessions yet.</p>}
          {sessions?.map((s) => (
            <div
              key={s.id}
              onClick={() => viewSession(s.id)}
              style={{
                padding: 10,
                borderBottom: "1px solid #222",
                cursor: "pointer",
                background: viewingSessionId === s.id ? "rgba(255,255,255,0.05)" : "transparent",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.8 }}>{new Date(s.updatedAt).toLocaleString()}</div>
              <div style={{ fontSize: 12, marginTop: 2 }}>
                {s.reviewed ? "✅ Reviewed" : "⏳ Not reviewed"} · {s.messageCount} msg
              </div>
              {s.lastMessage && (
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                  {s.lastMessage.length > 50 ? `${s.lastMessage.slice(0, 50)}…` : s.lastMessage}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {viewingSession ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong>Session transcript (read-only)</strong>
                <button onClick={newSession}>Close</button>
              </div>
              <div style={{ border: "1px solid #333", borderRadius: 8, minHeight: 240, padding: 16 }}>
                {!viewingMessages && <p style={subtleTextStyle}>Loading…</p>}
                {viewingMessages?.map((m, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <strong>{m.role === "user" ? "You" : m.role === "agent" ? "Agent" : "Assistant"}:</strong> {m.content}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button onClick={() => setMode("live")} disabled={mode === "live"}>
                  Live chat
                </button>
                <button onClick={() => setMode("dump")} disabled={mode === "dump"}>
                  Dump a chat
                </button>
              </div>

              {mode === "live" && (
                <>
                  <div
                    style={{
                      border: "1px solid #333",
                      borderRadius: 8,
                      minHeight: 240,
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {messages.length === 0 && (
                      <p style={subtleTextStyle}>
                        Try provoking a mistake — e.g. say something the AI mishandles, then tell it what it should have done instead.
                      </p>
                    )}

                    {messages.map((m, i) => (
                      <div key={i}>
                        <strong>{m.role === "user" ? "You" : "Assistant"}:</strong> {m.content}
                        {m.handoff && <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 6 }}>(handed off here)</span>}
                      </div>
                    ))}

                    {sending && <div style={{ opacity: 0.6 }}>Thinking…</div>}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <input
                      style={{ flex: 1, padding: 8 }}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") send();
                      }}
                      placeholder="Say something to the AI…"
                    />
                    <button onClick={send} disabled={sending}>
                      Send
                    </button>
                    <button onClick={newSession}>New session</button>
                    <button onClick={endAndReview} disabled={reviewing || messages.length === 0}>
                      {reviewing ? "Reviewing…" : "End session & review"}
                    </button>
                  </div>
                </>
              )}

              {mode === "dump" && (
                <>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Transcript</label>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder={"Paste the completed conversation, e.g.:\nuser: ...\nassistant: ..."}
                    style={{ width: "100%", minHeight: 160, padding: 8, boxSizing: "border-box", fontFamily: "monospace", fontSize: 12 }}
                  />
                  <label style={{ display: "block", margin: "12px 0 4px", fontSize: 13 }}>
                    Instructions — what should/shouldn&apos;t the bot have done
                  </label>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="e.g. It should not have handed off here — a simple greeting doesn't need a human."
                    style={{ width: "100%", minHeight: 80, padding: 8, boxSizing: "border-box" }}
                  />
                  <div style={{ marginTop: 12 }}>
                    <button onClick={submitDump} disabled={submittingDump || !transcript.trim() || !instructions.trim()}>
                      {submittingDump ? "Submitting…" : "Submit"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {message && <p style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>{message}</p>}

      {review && (
        <div style={{ ...cardStyle, marginTop: 16, background: "rgba(255,255,255,0.03)" }}>
          <h3 style={{ marginTop: 0 }}>What it learned</h3>
          {mode === "live" && (
            <p>
              <strong>Verdict:</strong> {review.verdict}
            </p>
          )}
          <p style={{ whiteSpace: "pre-wrap" }}>
            <strong>{mode === "live" ? "Findings:" : "Instructions:"}</strong>{" "}
            {review.findings || "(none — nothing worth extracting from this session)"}
          </p>

          {review.suggestion ? (
            <>
              <p>
                <strong>Proposed AI Brain addition:</strong>
              </p>
              <pre style={{ whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 4 }}>
                {review.suggestion.proposedAppendText}
              </pre>
              <p style={subtleTextStyle}>Why: {review.suggestion.reasoning}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => decide(true)} disabled={deciding}>
                  {deciding ? "…" : broadcast ? "Save to ALL clients" : "Save to AI Brain"}
                </button>
                <button onClick={() => decide(false)} disabled={deciding}>
                  {deciding ? "…" : "Discard"}
                </button>
              </div>
            </>
          ) : (
            <p style={subtleTextStyle}>
              No concrete rule change proposed from this session — either nothing went wrong, or there wasn&apos;t enough signal to act on.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
