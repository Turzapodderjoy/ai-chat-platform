"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, inputStyle, labelTextStyle } from "./dashboard-styles";

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

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Team Chat</h3>
          <p style={subtleTextStyle}>Internal staff messaging — shared across this business.</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          maxHeight: 420,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 12,
          paddingRight: 4,
        }}
      >
        {sorted.length === 0 ? (
          <p style={subtleTextStyle}>No messages yet — say hi to the team.</p>
        ) : (
          sorted.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: "flex-start",
                maxWidth: 520,
                background: "#f3f4f6",
                borderRadius: 10,
                padding: "8px 12px",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ ...labelTextStyle, fontWeight: 600 }}>{m.staff?.name ?? "Unknown"}</span>
                <span style={{ ...subtleTextStyle, fontSize: 11 }}>
                  {new Date(m.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <p style={{ margin: "2px 0 0", whiteSpace: "pre-wrap" }}>{m.body}</p>
            </div>
          ))
        )}
      </div>

      {error && <p style={{ ...subtleTextStyle, color: "#b91c1c", margin: "0 0 8px" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={authorId}
          onChange={(e) => setAuthorId(e.target.value)}
          style={{ ...inputStyle, minWidth: 140, flexShrink: 0 }}
        >
          <option value="">Anonymous</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Write a message…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button style={primaryButtonStyle} onClick={send} disabled={sending || !draft.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}