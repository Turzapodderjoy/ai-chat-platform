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
  externalUserId: string | null;
  customerName: string | null;
  handoffStatus: "bot" | "pending" | "human";
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
}

interface HandoffInfo {
  sessionId: string;
  summary: string | null;
}

interface Order {
  id: string;
  conversationId: string;
  customerName: string;
  phone: string;
  deliveryAddress: string;
  products: string;
  paymentMethod: string;
  createdAt: string;
}

interface RepairAppointment {
  id: string;
  trackingToken: string;
  customerName: string;
  phone: string;
  deviceType: string;
  deviceModel?: string;
  issueDescription: string;
  appointmentDate: string;
  status: string;
}

const REPAIR_STATUS_OPTIONS = ["booked", "received", "in_repair", "ready", "completed", "cancelled"] as const;
const REPAIR_STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  received: "Received",
  in_repair: "In Repair",
  ready: "Ready for Pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

const CHANNEL_LABEL: Record<string, { color: string; label: string }> = {
  website: { color: "#ffffff", label: "Website" },
  messenger: { color: "#0084ff", label: "Messenger" },
  instagram: { color: "#e1306c", label: "Instagram" },
  whatsapp: { color: "#25d366", label: "WhatsApp" },
  "repair-tracking": { color: "#f0883e", label: "Repair Tracking" },
};

function displayName(c: { customerName: string | null; externalUserId: string | null }): string {
  return c.customerName || c.externalUserId || "Customer";
}

/** "Rahim Hossain" -> "RH", "Customer" -> "C", a lone name -> first 2
 * letters — same shape as the mockup's avatar initials, no photos to
 * work with so this is the only real identity cue in the list. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || "C";
}

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

type SortOption = "newest" | "oldest";
type StatusTab = "all" | "handoff" | "human";

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: "all", label: "All Chats" },
  { id: "handoff", label: "Needs Handoff" },
  { id: "human", label: "Human Handling" },
];

/** Intercom-style unified inbox — every real conversation regardless of
 * channel or handoff status, in one place. Conversation list + a
 * transcript viewer + a detail panel, same pattern as Training Arena's
 * session sidebar. Reuses existing endpoints throughout (messages, tags,
 * handoffs, orders) rather than inventing new ones. */
export function AllChatsPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [channelFilter, setChannelFilter] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const [summaryBySession, setSummaryBySession] = useState<Record<string, string | null>>({});
  const [orderForSelected, setOrderForSelected] = useState<Order | null | undefined>(undefined);
  const [repairForSelected, setRepairForSelected] = useState<RepairAppointment | null | undefined>(undefined);
  const [savingRepairStatus, setSavingRepairStatus] = useState(false);

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

  useEffect(refresh, [businessId, channelFilter, sort]);

  // Poll instead of a one-shot fetch — a customer's new message otherwise
  // never appears until the agent manually reloads the page. 5s is a
  // reasonable balance for a support inbox (fast enough that an agent
  // isn't staring at a stale list, not so fast it hammers the DB every
  // panel keeps open in a browser tab all day). Only the first page
  // (newest N conversations) re-fetches, not deeper pagination — an
  // agent scrolled further back doesn't need that page force-refreshed
  // out from under them.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [businessId, channelFilter, sort, active]);

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

  function openConversation(c: ConversationSummary) {
    setSelectedId(c.id);
    setMessages(null);
    fetchMessages(c.id);
    markSeen(c.id, c.messageCount);

    // Conversation Summary and Order Actions both reuse existing
    // endpoints rather than adding new ones — the handoffs list already
    // carries a summary per session (only set once a conversation has
    // been in pending/human status), and the orders list already carries
    // conversationId to filter by client-side.
    if (!(c.id in summaryBySession)) {
      fetch(`/api/admin/handoffs?businessId=${encodeURIComponent(c.businessId)}`)
        .then((r) => r.json())
        .then((d: { handoffs: { sessionId: string; summary: string | null }[] }) => {
          setSummaryBySession((prev) => {
            const next = { ...prev };
            for (const h of d.handoffs) next[h.sessionId] = h.summary;
            return next;
          });
        });
    }

    setOrderForSelected(undefined);
    fetch(`/api/admin/orders?businessId=${encodeURIComponent(c.businessId)}`)
      .then((r) => r.json())
      .then((orders: Order[]) => setOrderForSelected(orders.find((o) => o.conversationId === c.id) ?? null));

    // repair-tracking conversations use the tracking token as their own
    // id (see RepairController) — same lookup shape as Order Actions
    // above, just matched on trackingToken instead of conversationId.
    if (c.channel === "repair-tracking") {
      setRepairForSelected(undefined);
      fetch(`/api/admin/repairs?businessId=${encodeURIComponent(c.businessId)}`)
        .then((r) => r.json())
        .then((d: { appointments: RepairAppointment[] }) =>
          setRepairForSelected(d.appointments.find((a) => a.trackingToken === c.id) ?? null)
        );
    } else {
      setRepairForSelected(undefined);
    }
  }

  async function updateRepairStatus(status: string) {
    if (!repairForSelected) return;
    setSavingRepairStatus(true);
    try {
      await fetch("/api/admin/repairs/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: repairForSelected.id, status }),
      });
      setRepairForSelected((prev) => (prev ? { ...prev, status } : prev));
    } finally {
      setSavingRepairStatus(false);
    }
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
    if (!active || !selectedId) return;

    const interval = setInterval(() => {
      fetchMessages(selectedId);
      const current = conversations?.find((c) => c.id === selectedId);
      if (current) markSeen(selectedId, current.messageCount);
    }, 4000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, active]);

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
        fetchMessages(selectedId);
        refresh();
      }
    } finally {
      setSending(false);
    }
  }

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;

  const visibleConversations = (conversations ?? []).filter((c) => {
    if (statusTab === "handoff") return c.handoffStatus === "pending";
    if (statusTab === "human") return c.handoffStatus === "human";
    return true;
  });

  // Counts are over the currently-loaded page only, not every conversation
  // this business has ever had — matches what "Load more" already implies
  // (the list itself is paginated), just made visible on the tabs too.
  const tabCounts: Record<StatusTab, number> = {
    all: conversations?.length ?? 0,
    handoff: conversations?.filter((c) => c.handoffStatus === "pending").length ?? 0,
    human: conversations?.filter((c) => c.handoffStatus === "human").length ?? 0,
  };

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>All Chats</h2>
      <p style={subtleTextStyle}>
        Every real conversation across every connected channel — Messenger, Instagram, WhatsApp, and the website
        widget — answered by the AI, with handed-off ones still replyable here.
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusTab(tab.id)}
            className="plain"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              background: statusTab === tab.id ? "var(--accent-soft)" : "transparent",
              color: statusTab === tab.id ? "var(--accent-strong)" : "var(--text-muted)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {tab.label}
            <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>{tabCounts[tab.id]}</span>
          </button>
        ))}
      </div>

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
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 280, flexShrink: 0, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", maxHeight: 620, overflowY: "auto" }}>
          {!conversations && <p style={{ padding: 10, ...subtleTextStyle }}>Loading…</p>}
          {conversations && visibleConversations.length === 0 && <p style={{ padding: 10, ...subtleTextStyle }}>No chats here.</p>}
          {visibleConversations.map((c) => {
            const ch = CHANNEL_LABEL[c.channel] ?? { color: "#8b96a8", label: c.channel };
            const unread = selectedId !== c.id && c.messageCount > (seenCounts[c.id] ?? 0);
            const name = displayName(c);
            return (
              <div
                key={c.id}
                onClick={() => openConversation(c)}
                style={{
                  padding: 10,
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  display: "flex",
                  gap: 10,
                  background: selectedId === c.id ? "var(--surface-hover)" : "transparent",
                  borderLeft: selectedId === c.id ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    background: selectedId === c.id ? "var(--accent-soft)" : "var(--surface)",
                    color: selectedId === c.id ? "var(--accent-strong)" : "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  {initials(name)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                      {unread && (
                        <span title="Unread" style={{ width: 7, height: 7, borderRadius: 999, background: "var(--accent)", flexShrink: 0 }} />
                      )}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                      <ChannelDot channel={c.channel} />
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--text-faint)", flexShrink: 0 }}>{new Date(c.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {c.lastMessage && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.lastMessage}
                    </div>
                  )}
                  {(conversationTags[c.id] ?? []).length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                      {(conversationTags[c.id] ?? []).map((t) => (
                        <span
                          key={t.tagId}
                          style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, background: "rgba(255,255,255,0.08)" }}
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  )}
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
          {!selected && <p style={subtleTextStyle}>Select a chat to view the conversation.</p>}
          {selected && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, fontSize: 13 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      background: "var(--accent-soft)",
                      color: "var(--accent-strong)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 11.5,
                    }}
                  >
                    {initials(displayName(selected))}
                  </div>
                  <strong>{displayName(selected)}</strong>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
                    <ChannelDot channel={selected.channel} />
                    {CHANNEL_LABEL[selected.channel]?.label ?? selected.channel}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: selected.handoffStatus === "bot" ? "var(--success-soft)" : selected.handoffStatus === "pending" ? "var(--warning-soft)" : "var(--accent-soft)",
                    color: selected.handoffStatus === "bot" ? "var(--success)" : selected.handoffStatus === "pending" ? "var(--warning)" : "var(--accent-strong)",
                  }}
                >
                  {selected.handoffStatus === "bot" ? "AI handling" : selected.handoffStatus === "pending" ? "Needs handoff" : "Human handling"}
                </span>
              </div>

              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", minHeight: 300, maxHeight: 420, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                    {!messages && <p style={subtleTextStyle}>Loading…</p>}
                    {messages?.map((m) => {
                      if (m.role === "system") {
                        return (
                          <div key={m.id} style={{ alignSelf: "center", fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
                            {m.content} · {new Date(m.createdAt).toLocaleString()}
                          </div>
                        );
                      }
                      const isCustomer = m.role === "user";
                      return (
                        <div key={m.id} style={{ display: "flex", gap: 8, flexDirection: isCustomer ? "row" : "row-reverse", maxWidth: "78%", alignSelf: isCustomer ? "flex-start" : "flex-end" }}>
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 7,
                              flexShrink: 0,
                              background: isCustomer ? "var(--surface)" : "var(--accent-soft)",
                              color: isCustomer ? "var(--text-faint)" : "var(--accent-strong)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: 9.5,
                            }}
                          >
                            {isCustomer ? initials(displayName(selected)) : "AI"}
                          </div>
                          <div style={{ textAlign: isCustomer ? "left" : "right" }}>
                            <div
                              style={{
                                background: isCustomer ? "var(--surface)" : "var(--accent)",
                                color: isCustomer ? "var(--text)" : "var(--bg)",
                                border: isCustomer ? "1px solid var(--border)" : "none",
                                borderRadius: isCustomer ? "12px 12px 12px 3px" : "12px 12px 3px 12px",
                                padding: "9px 12px",
                                fontSize: 13,
                                textAlign: "left",
                                display: "inline-block",
                              }}
                            >
                              {isCustomer ? m.content : <MarkdownMessage text={m.content} />}
                            </div>
                            {!isCustomer && m.provider && (
                              <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 3 }}>
                                Replied by {m.provider}
                                <ReasoningInfo provider={m.provider} confidence={m.confidence} sources={m.sources} />
                              </div>
                            )}
                            {!isCustomer && m.sources && m.sources.length > 0 && (
                              <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>
                                sources: {m.sources.map((s) => s.label).join(", ")}
                              </div>
                            )}
                            <div style={{ marginTop: 3 }}>
                              <MessageTagControl
                                catalog={tagCatalog}
                                applied={messageTags[m.id] ?? []}
                                onAssign={(tagId) => assignMessageTag(m.id, tagId)}
                                onRemove={(tagId) => removeMessageTag(m.id, tagId)}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                </div>

                {/* Detail panel — Contact Details / Tags / Conversation
                 * Summary / Order Actions, all sourced from data already
                 * fetched elsewhere in the app. "Stop AI"/"Resume AI"
                 * match the mockup's look but aren't wired to a real
                 * action yet — no endpoint exists to flip handoff status
                 * outside sending a message, so they're left visual-only
                 * rather than faking a control that doesn't do anything. */}
                <div style={{ width: 240, flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                    <button disabled title="Not wired up yet" style={{ flex: 1, fontSize: 12, padding: "8px 10px", opacity: 0.5 }}>
                      Stop AI
                    </button>
                    <button disabled title="Not wired up yet" style={{ flex: 1, fontSize: 12, padding: "8px 10px", opacity: 0.5 }}>
                      Resume AI
                    </button>
                  </div>

                  <div style={{ fontSize: 10.5, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 10 }}>
                    Contact Details
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-faint)" }}>Name</span>
                      <span>{displayName(selected)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-faint)" }}>Channel ID</span>
                      <span style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.externalUserId ?? "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-faint)" }}>Channel</span>
                      <span>{CHANNEL_LABEL[selected.channel]?.label ?? selected.channel}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: 10.5, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 10 }}>
                    Tags
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <MessageTagControl
                      catalog={tagCatalog}
                      applied={conversationTags[selected.id] ?? []}
                      onAssign={(tagId) => assignConversationTag(selected.id, tagId)}
                      onRemove={(tagId) => removeConversationTag(selected.id, tagId)}
                    />
                  </div>

                  {selected.channel === "repair-tracking" && repairForSelected !== undefined && (
                    <>
                      <div style={{ fontSize: 10.5, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 10 }}>
                        Repair Details
                      </div>
                      <div style={{ marginBottom: 20 }}>
                        {repairForSelected ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "var(--text-faint)" }}>Order ID</span>
                              <span>{repairForSelected.id}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "var(--text-faint)" }}>Customer</span>
                              <span>{repairForSelected.customerName}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "var(--text-faint)" }}>Device</span>
                              <span>{repairForSelected.deviceType}{repairForSelected.deviceModel ? ` — ${repairForSelected.deviceModel}` : ""}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "var(--text-faint)" }}>Appointment</span>
                              <span>{new Date(repairForSelected.appointmentDate).toLocaleString()}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "var(--text-faint)" }}>Token</span>
                              <span>{repairForSelected.trackingToken}</span>
                            </div>
                            <div style={{ color: "var(--text-muted)" }}>{repairForSelected.issueDescription}</div>
                            <select
                              value={repairForSelected.status}
                              onChange={(e) => updateRepairStatus(e.target.value)}
                              disabled={savingRepairStatus}
                              style={{ padding: 6, marginTop: 4 }}
                            >
                              {REPAIR_STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>{REPAIR_STATUS_LABEL[s]}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <p style={subtleTextStyle}>No appointment found for this conversation.</p>
                        )}
                      </div>
                    </>
                  )}

                  {selected.channel !== "repair-tracking" && orderForSelected !== undefined && (
                    <>
                      <div style={{ fontSize: 10.5, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 10 }}>
                        Order
                      </div>
                      <div style={{ marginBottom: 20 }}>
                        {orderForSelected ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "var(--text-faint)" }}>Order ID</span>
                              <span>{orderForSelected.id}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "var(--text-faint)" }}>Customer</span>
                              <span>{orderForSelected.customerName}</span>
                            </div>
                            <div>{orderForSelected.products}</div>
                            <div style={{ color: "var(--text-muted)" }}>{orderForSelected.deliveryAddress}</div>
                            <div style={{ color: "var(--text-muted)" }}>{orderForSelected.paymentMethod} · {orderForSelected.phone}</div>
                          </div>
                        ) : (
                          <p style={subtleTextStyle}>No order for this conversation.</p>
                        )}
                      </div>
                    </>
                  )}

                  {summaryBySession[selected.id] && (
                    <>
                      <div style={{ fontSize: 10.5, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 10 }}>
                        Conversation Summary
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{summaryBySession[selected.id]}</p>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
