"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle } from "./dashboard-styles";

interface Message {
  role: "system" | "user" | "assistant" | "agent";
  content: string;
  createdAt: string;
}

interface ConversationSummary {
  id: string;
  businessId: string;
  channel: string;
  handoffStatus: "bot" | "pending" | "human";
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
}

const CHANNEL_LABEL: Record<string, { icon: string; label: string }> = {
  website: { icon: "🌐", label: "Website" },
  messenger: { icon: "💬", label: "Messenger" },
  instagram: { icon: "📷", label: "Instagram" },
  whatsapp: { icon: "🟢", label: "WhatsApp" },
};

const STATUS_LABEL: Record<string, string> = {
  bot: "🤖 Bot",
  pending: "⏳ Needs human",
  human: "🧑 Human handling",
};

type SortOption = "newest" | "oldest";

/** Intercom-style unified inbox — every real conversation regardless of
 * channel or handoff status, in one place. Sidebar list + a transcript
 * viewer beside it, same pattern as Training Arena's session sidebar.
 * Reuses the existing /api/chat/messages (transcript) and
 * /api/admin/handoffs/reply (reply — now channel-aware, see
 * HandoffController.reply) endpoints rather than inventing new ones. */
export function AllChatsPanel({ businessId }: { businessId?: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [channelFilter, setChannelFilter] = useState("");
  const [handoffOnly, setHandoffOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>("newest");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  function buildQuery(cursor?: string) {
    const qs = new URLSearchParams();
    if (businessId) qs.set("businessId", businessId);
    if (channelFilter) qs.set("channel", channelFilter);
    if (handoffOnly) qs.set("needsHandoffOnly", "true");
    qs.set("sort", sort);
    if (cursor) qs.set("cursor", cursor);
    return qs.toString();
  }

  function refresh() {
    fetch(`/api/admin/conversations?${buildQuery()}`)
      .then((r) => r.json())
      .then((data) => {
        setConversations(data.conversations);
        setNextCursor(data.nextCursor);
      });
  }

  useEffect(refresh, [businessId, channelFilter, handoffOnly, sort]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/conversations?${buildQuery(nextCursor)}`);
      const data = await res.json();
      setConversations((prev) => [...(prev ?? []), ...data.conversations]);
      setNextCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function openConversation(id: string) {
    setSelectedId(id);
    setMessages(null);
    fetch(`/api/chat/messages?sessionId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []));
  }

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setSending(true);

    try {
      const res = await fetch("/api/admin/handoffs/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedId, message: reply }),
      });
      if (res.ok) {
        setReply("");
        openConversation(selectedId);
        refresh();
      }
    } finally {
      setSending(false);
    }
  }

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>All Chats</h2>
      <p style={subtleTextStyle}>
        Every real conversation across every connected channel — Messenger, Instagram, WhatsApp, and the website
        widget — answered by the AI, with handed-off ones still replyable here.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={{ padding: 6 }}>
          <option value="">All channels</option>
          <option value="website">🌐 Website</option>
          <option value="messenger">💬 Messenger</option>
          <option value="instagram">📷 Instagram</option>
          <option value="whatsapp">🟢 WhatsApp</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)} style={{ padding: 6 }}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <input type="checkbox" checked={handoffOnly} onChange={(e) => setHandoffOnly(e.target.checked)} />
          Needs handoff only
        </label>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ width: 280, flexShrink: 0, border: "1px solid #333", borderRadius: 8, maxHeight: 560, overflowY: "auto" }}>
          {!conversations && <p style={{ padding: 10, ...subtleTextStyle }}>Loading…</p>}
          {conversations && conversations.length === 0 && <p style={{ padding: 10, ...subtleTextStyle }}>No chats yet.</p>}
          {conversations?.map((c) => {
            const ch = CHANNEL_LABEL[c.channel] ?? { icon: "❔", label: c.channel };
            return (
              <div
                key={c.id}
                onClick={() => openConversation(c.id)}
                style={{
                  padding: 10,
                  borderBottom: "1px solid #222",
                  cursor: "pointer",
                  background: selectedId === c.id ? "rgba(255,255,255,0.05)" : "transparent",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>{ch.icon} {ch.label}</span>
                  <span style={{ opacity: 0.7 }}>{STATUS_LABEL[c.handoffStatus]}</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{new Date(c.updatedAt).toLocaleString()}</div>
                {c.lastMessage && (
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    {c.lastMessage.length > 60 ? `${c.lastMessage.slice(0, 60)}…` : c.lastMessage}
                  </div>
                )}
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
          {!selected && <p style={subtleTextStyle}>Select a chat to view the conversation.</p>}
          {selected && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                <span>
                  {CHANNEL_LABEL[selected.channel]?.icon ?? "❔"} {CHANNEL_LABEL[selected.channel]?.label ?? selected.channel}
                  {" · "}
                  {STATUS_LABEL[selected.handoffStatus]}
                </span>
                <code style={{ fontSize: 11, opacity: 0.6 }}>{selected.id}</code>
              </div>
              <div style={{ border: "1px solid #333", borderRadius: 8, minHeight: 300, maxHeight: 420, overflowY: "auto", padding: 16 }}>
                {!messages && <p style={subtleTextStyle}>Loading…</p>}
                {messages?.map((m, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <strong>{m.role === "user" ? "Customer" : m.role === "agent" ? "Agent" : m.role === "assistant" ? "AI" : "System"}:</strong>{" "}
                    {m.content}
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
