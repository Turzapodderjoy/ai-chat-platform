"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle } from "./dashboard-styles";
import { MessageTagControl } from "./MessageTagControl";
import { MarkdownMessage } from "./MarkdownMessage";
import { ReasoningInfo } from "./ReasoningInfo";

interface MessageSource {
  label: string;
  score: number;
  embeddingProvider?: string;
}

interface Message {
  id: string;
  role: "system" | "user" | "assistant" | "agent";
  content: string;
  provider: string | null;
  sources: MessageSource[] | null;
  confidence: number | null;
  createdAt: string;
}

interface Tag {
  id: string;
  label: string;
  color: string | null;
}

interface TagAssignment {
  tagId: string;
  label: string;
  color: string | null;
  source: string;
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

const CHANNEL_LABEL: Record<string, { color: string; label: string }> = {
  website: { color: "#ffffff", label: "Website" },
  messenger: { color: "#0084ff", label: "Messenger" },
  instagram: { color: "#e1306c", label: "Instagram" },
  whatsapp: { color: "#25d366", label: "WhatsApp" },
};

/** Solid colored circle per channel — Messenger blue, WhatsApp green,
 * website white (per the client's own spec), Instagram its brand pink
 * as the one channel that wasn't specified. A thin border keeps the
 * white website dot visible against the dark dashboard background. */
function ChannelDot({ channel }: { channel: string }) {
  const color = CHANNEL_LABEL[channel]?.color ?? "#8b96a8";
  return (
    <span
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: color,
        border: "1px solid rgba(255,255,255,0.25)",
        flexShrink: 0,
      }}
    />
  );
}

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

  // Which messageCount an agent had last seen, per conversation — a
  // conversation is "unread" when the live list's current messageCount
  // exceeds this. Persisted (survives a reload, unlike plain state) so
  // reopening the dashboard doesn't mark everything unread again; scoped
  // per business so one client's read state doesn't bleed into another's
  // panel. Comparing counts rather than timestamps sidesteps clock-skew
  // edge cases entirely.
  const seenKey = `allChatsSeen:${businessId ?? "platform"}`;
  const [seenCounts, setSeenCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      setSeenCounts(JSON.parse(window.localStorage.getItem(seenKey) ?? "{}"));
    } catch {
      setSeenCounts({});
    }
  }, [seenKey]);

  function markSeen(id: string, count: number) {
    setSeenCounts((prev) => {
      const next = { ...prev, [id]: count };
      window.localStorage.setItem(seenKey, JSON.stringify(next));
      return next;
    });
  }

  const [tagCatalog, setTagCatalog] = useState<Tag[]>([]);
  const [conversationTags, setConversationTags] = useState<Record<string, TagAssignment[]>>({});
  const [messageTags, setMessageTags] = useState<Record<string, TagAssignment[]>>({});

  useEffect(() => {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/tags${qs}`)
      .then((r) => r.json())
      .then((d) => setTagCatalog(d.tags));
  }, [businessId]);

  function refreshConversationTags(ids: string[]) {
    if (ids.length === 0) return;
    fetch(`/api/admin/tags/for-conversations?ids=${ids.map(encodeURIComponent).join(",")}`)
      .then((r) => r.json())
      .then((d) => setConversationTags((prev) => ({ ...prev, ...d.tagsByConversationId })));
  }

  function refreshMessageTags(ids: string[]) {
    if (ids.length === 0) return;
    fetch(`/api/admin/tags/for-messages?ids=${ids.map(encodeURIComponent).join(",")}`)
      .then((r) => r.json())
      .then((d) => setMessageTags((prev) => ({ ...prev, ...d.tagsByMessageId })));
  }

  async function assignConversationTag(conversationId: string, tagId: string) {
    await fetch("/api/admin/tags/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, tagId }),
    });
    refreshConversationTags([conversationId]);
  }

  async function removeConversationTag(conversationId: string, tagId: string) {
    await fetch(`/api/admin/tags/assign?conversationId=${encodeURIComponent(conversationId)}&tagId=${encodeURIComponent(tagId)}`, {
      method: "DELETE",
    });
    refreshConversationTags([conversationId]);
  }

  async function assignMessageTag(messageId: string, tagId: string) {
    await fetch("/api/admin/tags/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, tagId }),
    });
    refreshMessageTags([messageId]);
  }

  async function removeMessageTag(messageId: string, tagId: string) {
    await fetch(`/api/admin/tags/assign?messageId=${encodeURIComponent(messageId)}&tagId=${encodeURIComponent(tagId)}`, {
      method: "DELETE",
    });
    refreshMessageTags([messageId]);
  }

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
        refreshConversationTags(data.conversations.map((c: ConversationSummary) => c.id));
      });
  }

  useEffect(refresh, [businessId, channelFilter, handoffOnly, sort]);

  // Poll instead of a one-shot fetch — a customer's new message otherwise
  // never appears until the agent manually reloads the page. 5s is a
  // reasonable balance for a support inbox (fast enough that an agent
  // isn't staring at a stale list, not so fast it hammers the DB every
  // panel keeps open in a browser tab all day). Only the first page
  // (newest N conversations) re-fetches, not deeper pagination — an
  // agent scrolled further back doesn't need that page force-refreshed
  // out from under them.
  useEffect(() => {
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [businessId, channelFilter, handoffOnly, sort]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/conversations?${buildQuery(nextCursor)}`);
      const data = await res.json();
      setConversations((prev) => [...(prev ?? []), ...data.conversations]);
      setNextCursor(data.nextCursor);
      refreshConversationTags(data.conversations.map((c: ConversationSummary) => c.id));
    } finally {
      setLoadingMore(false);
    }
  }

  function openConversation(id: string) {
    setSelectedId(id);
    setMessages(null);
    fetchMessages(id);
    const current = conversations?.find((c) => c.id === id);
    if (current) markSeen(id, current.messageCount);
  }

  function fetchMessages(id: string) {
    fetch(`/api/chat/messages?sessionId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        const msgs: Message[] = data.messages ?? [];
        setMessages(msgs);
        refreshMessageTags(msgs.map((m) => m.id));
      });
  }

  // Keeps the open transcript itself live too — a customer's new message
  // otherwise only shows up once the agent closes and reopens the
  // conversation. Also re-marks it seen each poll, so a chat left open
  // never shows as unread in the list next to it.
  useEffect(() => {
    if (!selectedId) return;

    const interval = setInterval(() => {
      fetchMessages(selectedId);
      const current = conversations?.find((c) => c.id === selectedId);
      if (current) markSeen(selectedId, current.messageCount);
    }, 4000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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
          <option value="website">Website</option>
          <option value="messenger">Messenger</option>
          <option value="instagram">Instagram</option>
          <option value="whatsapp">WhatsApp</option>
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
        <div style={{ width: 280, flexShrink: 0, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", maxHeight: 560, overflowY: "auto" }}>
          {!conversations && <p style={{ padding: 10, ...subtleTextStyle }}>Loading…</p>}
          {conversations && conversations.length === 0 && <p style={{ padding: 10, ...subtleTextStyle }}>No chats yet.</p>}
          {conversations?.map((c) => {
            const ch = CHANNEL_LABEL[c.channel] ?? { color: "#8b96a8", label: c.channel };
            const unread = selectedId !== c.id && c.messageCount > (seenCounts[c.id] ?? 0);
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
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {unread && (
                      <span
                        title="Unread"
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: "var(--accent, #4c8dfa)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <ChannelDot channel={c.channel} /> {ch.label}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>{STATUS_LABEL[c.handoffStatus]}</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{new Date(c.updatedAt).toLocaleString()}</div>
                {c.lastMessage && (
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    {c.lastMessage.length > 60 ? `${c.lastMessage.slice(0, 60)}…` : c.lastMessage}
                  </div>
                )}
                {(conversationTags[c.id] ?? []).length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                    {(conversationTags[c.id] ?? []).map((t) => (
                      <span
                        key={t.tagId}
                        style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "rgba(255,255,255,0.08)" }}
                      >
                        {t.label}
                      </span>
                    ))}
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 13 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ChannelDot channel={selected.channel} />
                  {CHANNEL_LABEL[selected.channel]?.label ?? selected.channel}
                  {" · "}
                  {STATUS_LABEL[selected.handoffStatus]}
                </span>
                <code style={{ fontSize: 11, color: "var(--text-faint)" }}>{selected.id}</code>
              </div>
              <div style={{ marginBottom: 8 }}>
                <MessageTagControl
                  catalog={tagCatalog}
                  applied={conversationTags[selected.id] ?? []}
                  onAssign={(tagId) => assignConversationTag(selected.id, tagId)}
                  onRemove={(tagId) => removeConversationTag(selected.id, tagId)}
                />
              </div>
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", minHeight: 300, maxHeight: 420, overflowY: "auto", padding: 16 }}>
                {!messages && <p style={subtleTextStyle}>Loading…</p>}
                {messages?.map((m) => (
                  <div key={m.id} style={{ marginBottom: 10 }}>
                    <div>
                      <strong>{m.role === "user" ? "Customer" : m.role === "agent" ? "Agent" : m.role === "assistant" ? "AI" : "System"}:</strong>{" "}
                      {m.role === "user" ? m.content : <MarkdownMessage text={m.content} />}
                    </div>
                    {m.role === "assistant" && m.provider && (
                      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                        answered by: {m.provider}
                        <ReasoningInfo provider={m.provider} confidence={m.confidence} sources={m.sources} />
                      </div>
                    )}
                    {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                        sources: {m.sources.map((s) => s.label).join(", ")}
                      </div>
                    )}
                    <div style={{ marginTop: 2 }}>
                      <MessageTagControl
                        catalog={tagCatalog}
                        applied={messageTags[m.id] ?? []}
                        onAssign={(tagId) => assignMessageTag(m.id, tagId)}
                        onRemove={(tagId) => removeMessageTag(m.id, tagId)}
                      />
                    </div>
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
                <button onClick={sendReply} disabled={sending} style={primaryButtonStyle}>
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
