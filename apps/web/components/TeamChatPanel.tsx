"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

// Wave B #18 - Team chat / internal staff messaging. Minimal group thread scoped
// to a business: every dashboard user with this businessId sees the shared feed.
// Messages are attributed to Staff if the sender picked a staff name, else
// "Unknown". Polls every 10s while the tab is active; no read receipts/push.

interface Staff {
  id: string;
  name: string;
}

interface TeamMessage {
  id: string;
  body: string;
  createdAt: string;
  staffId: string | null;
  staff: Staff | null;
}

export function TeamChatPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [authorId, setAuthorId] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/admin/team-chat?businessId=${encodeURIComponent(businessId)}&limit=50`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
      setStaff(data.staff ?? []);
    }
  }, [businessId]);

  useEffect(() => {
    if (!active) return;
    refresh();
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  useEffect(() => {
    if (messages.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const res = await fetch(`/api/admin/team-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, staffId: authorId || null, body }),
    });
    setSending(false);
    if (res.ok) {
      setDraft("");
      setError(null);
      refresh();
    } else {
      setError("Failed to send message");
    }
  };

  const sorted = [...messages].reverse();

const FEED: CSSProperties = {
  maxHeight: 420,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginBottom: 14,
  paddingRight: 4,
};

const BUBBLE: CSSProperties = {
  alignSelf: "flex-start",
  maxWidth: 520,
  padding: "9px 12px",
  borderRadius: "var(--r-md)",
  background: "var(--panel-sunk)",
  border: "1px solid var(--line)",
};

return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Team chat</span>
        <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {messages.length} messages
        </span>
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 12 }}>
          Internal staff messaging — shared across this business.
        </p>

        <div ref={scrollRef} style={FEED}>
          {sorted.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No messages yet</div>
              <div className="empty-state-description">
                Say hi to the team — everyone signed into this business sees the same thread.
              </div>
            </div>
          ) : (
            sorted.map((m) => (
              <div key={m.id} style={BUBBLE}>
                <div style={{ display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
                    {m.staff?.name ?? "Unknown"}
                  </span>
                  <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {new Date(m.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <p style={{ margin: "3px 0 0", whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)" }}>
                  {m.body}
                </p>
              </div>
            ))
          )}
        </div>

        {error && (
          <p
            className="meta"
            style={{ margin: "0 0 10px", padding: "8px 11px", borderRadius: "var(--r-sm)", background: "var(--danger-subtle)", color: "var(--danger)" }}
          >
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 150 }}>
            <label className="field-label" htmlFor="teamchat-author">Post as</label>
            <select id="teamchat-author" value={authorId} onChange={(e) => setAuthorId(e.target.value)} style={{ fontSize: 13 }}>
              <option value="">Anonymous</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label className="field-label" htmlFor="teamchat-draft">Message</label>
            <input
              id="teamchat-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="Write a message"
              style={{ fontSize: 13 }}
            />
          </div>
          <button className="primary" onClick={send} disabled={sending || !draft.trim()}>
            {sending ? "Sending" : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}
