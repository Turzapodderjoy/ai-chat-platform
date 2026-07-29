"use client";

import { useEffect, useState } from "react";

import { cardStyle } from "./dashboard-styles";

interface HandoffSummary {
  sessionId: string;
  status: string;
  reason: string | null;
  summary: string | null;
  requestedAt: string | null;
  lastMessage: string;
}

interface HandoffMessage {
  role: "system" | "user" | "assistant" | "agent";
  content: string;
  createdAt: string;
}

/** Same component for the mother dashboard (no businessId = every client's
 * handoffs) and each per-client dashboard (scoped). One place to change. */
export function HandoffsPanel({ businessId }: { businessId?: string }) {
  const [handoffs, setHandoffs] = useState<HandoffSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<HandoffMessage[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  function refreshList() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/handoffs${qs}`)
      .then((r) => r.json())
      .then((data) => setHandoffs(data.handoffs));
  }

  function openChat(sessionId: string) {
    setOpenId(sessionId);
    fetch(`/api/admin/handoffs/messages?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages));
  }

  useEffect(() => {
    refreshList();
    const interval = setInterval(refreshList, 5000);
    return () => clearInterval(interval);
  }, [businessId]);

  async function sendReply() {
    if (!openId || !reply.trim()) return;
    setSending(true);

    try {
      await fetch("/api/admin/handoffs/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: openId, message: reply }),
      });
      setReply("");
      openChat(openId);
      refreshList();
    } finally {
      setSending(false);
    }
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Handoffs</h2>
      <p style={{ opacity: 0.6 }}>
        Chats the AI couldn&apos;t confidently answer land here with an
        auto-generated summary — pick one up and reply as a human agent.
      </p>

      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 1 }}>
          {!handoffs && <p>Loading…</p>}
          {handoffs?.length === 0 && <p style={{ opacity: 0.6 }}>No handoffs right now.</p>}
          {handoffs?.map((h) => (
            <div
              key={h.sessionId}
              onClick={() => openChat(h.sessionId)}
              style={{
                border: openId === h.sessionId ? "2px solid #666" : "1px solid #333",
                borderRadius: 6,
                padding: 12,
                marginBottom: 8,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <code style={{ fontSize: 11 }}>{h.sessionId}</code>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: h.status === "pending" ? "#553" : "#353",
                  }}
                >
                  {h.status}
                </span>
              </div>
              <p style={{ fontSize: 13, margin: "6px 0" }}>{h.summary}</p>
              <p style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>
                Last: {h.lastMessage}
              </p>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          {!openId && <p style={{ opacity: 0.6 }}>Select a handoff to view the conversation.</p>}

          {openId && (
            <>
              <div
                style={{
                  border: "1px solid #333",
                  borderRadius: 8,
                  minHeight: 200,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {messages?.map((m, i) => (
                  <div key={i} style={{ fontSize: 13 }}>
                    <strong>{m.role}:</strong> {m.content}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  style={{ flex: 1, padding: 8 }}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendReply();
                  }}
                  placeholder="Reply to the customer…"
                />
                <button onClick={sendReply} disabled={sending}>
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
