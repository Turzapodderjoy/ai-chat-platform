"use client";

import { useEffect, useRef, useState } from "react";

import { MarkdownMessage } from "./MarkdownMessage";

interface Message {
  role: "user" | "assistant" | "agent";
  content: string;
  provider?: string;
  tokens?: number;
  confidence?: number;
  cached?: boolean;
  /** The persisted assistant Message's id — absent for the "waiting on a
   * human agent" notice and for client-side error messages, neither of
   * which is a real recorded answer worth QA'ing. */
  messageId?: string;
}

interface QaState {
  /** Locally selected, not yet sent — Submit is what actually saves it. */
  verdict: "pass" | "fail" | null;
  note: string;
  submitting: boolean;
  saved: boolean;
}

function sessionKey(businessId: string): string {
  return `chatSessionId:${businessId}`;
}

/** Real initials — "Paikari Bazar" -> "PB" (first letter of the first
 * two words), "Acme" -> "AC" (first two letters of a single word).
 * Falls back to "XX" for a name with no letters at all (shouldn't
 * happen in practice, just avoids an empty prefix). */
function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));

  const initials =
    words.length >= 2
      ? words[0]!.charAt(0) + words[1]!.charAt(0)
      : (words[0] ?? "").replace(/[^a-zA-Z]/g, "").slice(0, 2);

  return (initials || "XX").toUpperCase();
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** "PB-20260729-153042-a1b2" — client initials + date + time so a Chat
 * ID actually means something at a glance instead of being a random
 * UUID, with a short random suffix only to avoid a collision if two
 * chats somehow start in the same second. */
function generateSessionId(businessName: string): string {
  const suffix = Math.random().toString(16).slice(2, 6);
  return `${initialsFromName(businessName)}-${formatTimestamp(new Date())}-${suffix}`;
}

function getSessionId(businessId: string, businessName: string): string {
  const key = sessionKey(businessId);
  const existing = window.localStorage.getItem(key);

  if (existing) {
    return existing;
  }

  const generated = generateSessionId(businessName);
  window.localStorage.setItem(key, generated);
  return generated;
}

export function ChatWidget({
  businessId = "default",
  businessName,
}: {
  businessId?: string;
  /** Real client name, used for the Chat ID's initials — omit only for
   * the mother dashboard's generic (no specific client) demo. When
   * businessId points at a real client, generation waits for this to
   * arrive rather than falling back, since whatever's generated first
   * gets persisted to localStorage permanently for that business. */
  businessName?: string;
}) {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [waitingForAgent, setWaitingForAgent] = useState(false);
  const [qa, setQa] = useState<Record<string, QaState>>({});
  const seenCount = useRef(0);

  const isGenericDemo = businessId === "default";
  const effectiveName = businessName ?? (isGenericDemo ? "General Demo" : "");
  const nameReady = isGenericDemo || !!businessName;

  useEffect(() => {
    if (!nameReady) return;
    setSessionId(getSessionId(businessId, effectiveName));
  }, [businessId, nameReady, effectiveName]);

  // Once a human handoff happens, poll for the agent's replies — the
  // server can't push to the browser without a websocket, so this is
  // the simplest thing that works for a first version.
  useEffect(() => {
    if (!waitingForAgent || !sessionId) return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/chat/messages?sessionId=${sessionId}`);
      if (!res.ok) return;

      const data = await res.json();
      const history: { role: string; content: string }[] = data.messages ?? [];
      const agentMessages = history.filter((m) => m.role === "agent");

      if (agentMessages.length > seenCount.current) {
        const newOnes = agentMessages.slice(seenCount.current);
        seenCount.current = agentMessages.length;
        setMessages((prev) => [
          ...prev,
          ...newOnes.map((m) => ({ role: "agent" as const, content: m.content })),
        ]);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [waitingForAgent, sessionId]);

  async function send() {
    const message = input.trim();
    if (!message || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setLoading(true);

    try {
      // A dropped connection fails the fetch itself, before the server
      // ever gets a chance to return its own friendly timeout message
      // (see /api/chat's withTimeout handling) — that's the ONE path
      // server-side rotation/timeout logic can never cover, since the
      // request never arrived. Owner's call: taking up to a minute with
      // the typing indicator up is fine, a raw error is not — so this
      // keeps retrying for a full minute before giving up (confirmed
      // live: a customer's "Yes" on order confirmation showed a raw
      // "TypeError: Failed to fetch" on a flaky mobile connection).
      const retryDeadline = Date.now() + 75_000;
      let res: Response | null = null;
      let lastErr: unknown;
      let attempt = 0;
      while (!res) {
        if (attempt > 0) {
          if (Date.now() >= retryDeadline) break;
          await new Promise((r) => setTimeout(r, 2500));
        }
        attempt++;
        try {
          res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, message, businessId }),
          });
        } catch (err) {
          lastErr = err;
        }
      }
      if (!res) throw lastErr;

      const data = await res.json();

      if (res.ok && data.handoff) {
        setWaitingForAgent(true);
      }

      setMessages((prev) => [
        ...prev,
        res.ok
          ? {
              role: "assistant",
              content: data.answer,
              provider: data.provider,
              tokens: data.tokens,
              confidence: data.confidence,
              cached: data.cached,
              messageId: data.messageId,
            }
          : {
              role: "assistant",
              content: "We're having trouble connecting right now — a team member will follow up with you shortly.",
            },
      ]);
    } catch {
      // Never show the raw error to a real customer — same copy the
      // server's own timeout fallback uses, so the widget doesn't need
      // to special-case this path either.
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "We're having trouble connecting right now — a team member will follow up with you shortly.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function exportChat() {
    const lines = messages.map((m) => {
      const speaker = m.role === "user" ? "You" : m.role === "agent" ? "Agent" : "Assistant";
      return `${speaker}: ${m.content}`;
    });

    const blob = new Blob([`Chat ${sessionId}\n\n${lines.join("\n\n")}\n`], {
      type: "text/plain",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessionId || "chat"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function newChat() {
    if (!nameReady) return;
    window.localStorage.removeItem(sessionKey(businessId));
    setSessionId(getSessionId(businessId, effectiveName));
    setMessages([]);
    setWaitingForAgent(false);
    setQa({});
    seenCount.current = 0;
  }

  function selectQaVerdict(messageId: string, verdict: "pass" | "fail") {
    setQa((prev) => ({
      ...prev,
      [messageId]: { verdict, note: prev[messageId]?.note ?? "", submitting: false, saved: false },
    }));
  }

  function setQaNote(messageId: string, note: string) {
    setQa((prev) => ({
      ...prev,
      [messageId]: { ...(prev[messageId] ?? { verdict: null, submitting: false, saved: false }), note },
    }));
  }

  async function submitQa(messageId: string) {
    const state = qa[messageId];
    if (!state?.verdict) return;

    setQa((prev) => ({ ...prev, [messageId]: { ...state, submitting: true, saved: false } }));

    try {
      const res = await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, businessId, verdict: state.verdict, note: state.note }),
      });

      setQa((prev) => ({
        ...prev,
        [messageId]: { ...state, submitting: false, saved: res.ok },
      }));
    } catch {
      setQa((prev) => ({ ...prev, [messageId]: { ...state, submitting: false, saved: false } }));
    }
  }

  return (
    <div>
      <p style={{ opacity: 0.5, fontSize: 12 }}>
        Chat ID: {sessionId}
        {waitingForAgent && " · connected to a human agent"}
        {" · "}
        <button
          onClick={newChat}
          style={{ fontSize: 12, padding: "1px 6px", cursor: "pointer" }}
        >
          New chat
        </button>{" "}
        <button
          onClick={exportChat}
          disabled={messages.length === 0}
          style={{ fontSize: 12, padding: "1px 6px", cursor: "pointer" }}
        >
          Export chat
        </button>
      </p>

      <div
        style={{
          border: "1px solid #333",
          borderRadius: 8,
          minHeight: 280,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.length === 0 && (
          <p style={{ opacity: 0.6 }}>
            Upload a document, then ask a question about it here. Every
            answer gets a QA pass/fail button below it — use it to flag
            good and bad answers for the training pipeline.
          </p>
        )}

        {messages.map((m, i) => {
          const state = m.messageId ? qa[m.messageId] : undefined;

          return (
            <div key={i}>
              <div>
                <strong>
                  {m.role === "user" ? "You" : m.role === "agent" ? "Agent" : "Assistant"}:
                </strong>
                {m.role === "user" ? ` ${m.content}` : <MarkdownMessage text={m.content} />}
              </div>
              {m.role === "assistant" && m.provider && (
                <div style={{ fontSize: 11, opacity: 0.5 }}>
                  {m.provider}
                  {m.cached && " (cached, 0 tokens)"} ·{" "}
                  {Math.round((m.confidence ?? 0) * 100)}% confidence ·{" "}
                  {m.tokens} tokens
                </div>
              )}

              {m.role === "assistant" && m.messageId && (
                <div style={{ marginTop: 4, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={() => selectQaVerdict(m.messageId!, "pass")}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      background: state?.verdict === "pass" ? "#1a5" : "transparent",
                      color: state?.verdict === "pass" ? "#fff" : "inherit",
                      border: "1px solid #1a5",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    ✓ Pass
                  </button>
                  <button
                    onClick={() => selectQaVerdict(m.messageId!, "fail")}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      background: state?.verdict === "fail" ? "#c33" : "transparent",
                      color: state?.verdict === "fail" ? "#fff" : "inherit",
                      border: "1px solid #c33",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    ✗ Fail
                  </button>
                  {state?.verdict && (
                    <>
                      <input
                        placeholder="Why? (optional — feeds the training pipeline)"
                        value={state.note}
                        onChange={(e) => setQaNote(m.messageId!, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitQa(m.messageId!);
                        }}
                        style={{ fontSize: 11, padding: "3px 6px", flex: 1, minWidth: 160 }}
                      />
                      <button
                        onClick={() => submitQa(m.messageId!)}
                        disabled={state.submitting}
                        style={{ fontSize: 11, padding: "2px 10px", cursor: "pointer" }}
                      >
                        {state.submitting ? "Submitting…" : "Submit"}
                      </button>
                    </>
                  )}
                  {state?.saved && !state.submitting && (
                    <span style={{ fontSize: 11, opacity: 0.5 }}>Saved ✓</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {loading && <div style={{ opacity: 0.6 }}>Thinking…</div>}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          style={{ flex: 1, padding: 8 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Ask something…"
        />
        <button onClick={send} disabled={loading}>
          Send
        </button>
      </div>
    </div>
  );
}
