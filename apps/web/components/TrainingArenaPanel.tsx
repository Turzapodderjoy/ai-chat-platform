"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle } from "./dashboard-styles";
import { MarkdownMessage } from "./MarkdownMessage";
import { ReasoningInfo } from "./ReasoningInfo";

interface MessageSource {
  label: string;
  score: number;
  embeddingProvider?: string;
}

interface Message {
  role: "user" | "assistant" | "agent";
  content: string;
  provider?: string;
  handoff?: boolean;
  sources?: MessageSource[] | null;
  confidence?: number | null;
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

/** Intercom-style layout: a sidebar of past Training Arena sessions
 * beside the active chat/dump window. Live chat mode talks to the real
 * chat pipeline (retrieval, system prompt, handoff logic) so you can
 * deliberately provoke and correct real behavior — the AI keeps
 * responding even after a handoff, since the point is arguing with it
 * about the handoff itself. Dump mode parses a pasted transcript into a
 * real conversation. Neither mode analyzes or proposes anything anymore
 * — every session just lands in Chat Learning, where a human decides
 * what to do with it. */
export function TrainingArenaPanel({ businessId }: { businessId: string }) {
  const [mode, setMode] = useState<Mode>("live");

  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [viewingMessages, setViewingMessages] = useState<Message[] | null>(null);

  const [sessionId, setSessionId] = useState(newSessionId());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
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
          ? { role: "assistant", content: data.answer, provider: data.provider, handoff: data.handoff, sources: data.sources, confidence: data.confidence }
          : { role: "assistant", content: `Error: ${data.detail ?? data.error}` },
      ]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${String(err)}` }]);
    } finally {
      setSending(false);
    }
  }

  async function submitDump() {
    if (!transcript.trim()) return;
    setSubmittingDump(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/training/dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, transcript, instructions }),
      });
      const data = await res.json();

      if (res.ok) {
        setMessage("Added — find it in Chat Learning to review and curate.");
        setTranscript("");
        setInstructions("");
        refreshSessions();
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } finally {
      setSubmittingDump(false);
    }
  }

  const viewingSession = viewingSessionId !== null;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Training Arena</h2>
      <p style={subtleTextStyle}>
        Chat with the AI (or paste a completed chat) to create a session — review and curate it in Chat Learning.
      </p>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ width: 220, flexShrink: 0, border: "1px solid var(--border)", borderRadius: 8, maxHeight: 480, overflowY: "auto" }}>
          <div style={{ padding: 10, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                background: viewingSessionId === s.id ? "var(--surface-hover)" : "transparent",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(s.updatedAt).toLocaleString()}</div>
              <div style={{ fontSize: 12, marginTop: 2 }}>
                {s.reviewed ? "✅ In Chat Learning" : "⏳ Not reviewed yet"} · {s.messageCount} msg
              </div>
              {s.lastMessage && (
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
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
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, minHeight: 240, padding: 16 }}>
                {!viewingMessages && <p style={subtleTextStyle}>Loading…</p>}
                {viewingMessages?.map((m, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <strong>{m.role === "user" ? "You" : m.role === "agent" ? "Agent" : "Assistant"}:</strong>{" "}
                    {m.role === "user" ? m.content : <MarkdownMessage text={m.content} />}
                    {m.role === "assistant" && (
                      <ReasoningInfo provider={m.provider} confidence={m.confidence} sources={m.sources} />
                    )}
                    {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                        sources: {m.sources.map((s) => s.label).join(", ")}
                      </div>
                    )}
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
                      border: "1px solid var(--border)",
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
                        <strong>{m.role === "user" ? "You" : "Assistant"}:</strong>{" "}
                        {m.role === "user" ? m.content : <MarkdownMessage text={m.content} />}
                        {m.handoff && <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: 6 }}>(handed off here)</span>}
                        {m.role === "assistant" && (
                          <ReasoningInfo provider={m.provider} confidence={m.confidence} sources={m.sources} />
                        )}
                        {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                            sources: {m.sources.map((s) => s.label).join(", ")}
                          </div>
                        )}
                      </div>
                    ))}

                    {sending && <div style={subtleTextStyle}>Thinking…</div>}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <input
                      style={{ flex: 1 }}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") send();
                      }}
                      placeholder="Say something to the AI…"
                    />
                    <button onClick={send} disabled={sending} style={primaryButtonStyle}>
                      Send
                    </button>
                    <button onClick={newSession}>New session</button>
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
                    style={{ width: "100%", minHeight: 160, boxSizing: "border-box", fontFamily: "monospace", fontSize: 12 }}
                  />
                  <label style={{ display: "block", margin: "12px 0 4px", fontSize: 13 }}>
                    Note (optional — saved as this chat&apos;s initial QA note in Chat Learning)
                  </label>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="e.g. It should not have handed off here — a simple greeting doesn't need a human."
                    style={{ width: "100%", minHeight: 80, boxSizing: "border-box" }}
                  />
                  <div style={{ marginTop: 12 }}>
                    <button onClick={submitDump} disabled={submittingDump || !transcript.trim()} style={primaryButtonStyle}>
                      {submittingDump ? "Adding…" : "Add to Chat Learning"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {message && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>{message}</p>}
    </section>
  );
}
