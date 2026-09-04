"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, shortId } from "./dashboard-styles";
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
  assignedAgentId: string | null;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
}

interface Agent {
  id: string;
  businessId: string | null;
  username: string;
  online: boolean;
  disabled: boolean;
}

interface HandoffInfo {
  sessionId: string;
  summary: string | null;
}

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface Note {
  id: string;
  author: string;
  body: string;
  createdAt: string;
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
  serialNumber?: string;
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
const MOBILE_BREAKPOINT = 860;

export function AllChatsPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Below MOBILE_BREAKPOINT the fixed 280px list + 240px detail columns
  // (real bug, confirmed live: forced ~520px+ of side columns alone
  // inside a 375px viewport) collapse into a single-column, one-thing-
  // at-a-time flow instead: list, OR thread+detail with a back button —
  // same pattern DashboardShell's own sidebar already uses.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState({ phone: "", deviceType: "", issueDescription: "" });
  const [savingNewOrder, setSavingNewOrder] = useState(false);
  const [savingRepairStatus, setSavingRepairStatus] = useState(false);
  const [contactForSelected, setContactForSelected] = useState<Contact | null | undefined>(undefined);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("admin");

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

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { username?: string }) => {
        if (d.username) setCurrentUsername(d.username);
      });
  }, []);

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

  // The handoff team -- who's handling what. Fetched unfiltered (every
  // isAgent account across every business) so a row's "assigned to"
  // badge resolves even in the mother dashboard's cross-client Inbox.
  // Agent logins themselves are created/removed elsewhere (Client
  // Access) -- this panel only reads the roster to populate the
  // per-conversation assignment dropdown.
  const [agents, setAgents] = useState<Agent[]>([]);
  const [reassigning, setReassigning] = useState(false);

  useEffect(() => {
    fetch("/api/admin/client-accounts")
      .then((r) => r.json())
      .then((d: { accounts: (Agent & { isAgent: boolean })[] }) => setAgents((d.accounts ?? []).filter((a) => a.isAgent)));
  }, []);

  const agentsForBusiness = agents.filter((a) => a.businessId === businessId);
  const agentName = (id: string | null) => (id ? agents.find((a) => a.id === id)?.username ?? "agent" : null);

  async function reassignSelected(agentId: string | null) {
    if (!selectedId) return;
    setReassigning(true);
    try {
      await fetch("/api/admin/handoffs/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedId, agentId }),
      });
      refresh();
    } finally {
      setReassigning(false);
    }
  }

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

  function refreshNotes(conversationId: string) {
    fetch(`/api/admin/handoffs/notes?conversationId=${encodeURIComponent(conversationId)}`)
      .then((r) => r.json())
      .then((d: { notes: Note[] }) => setNotes(d.notes));
  }

  function openConversation(c: ConversationSummary) {
    setSelectedId(c.id);
    setMessages(null);
    fetchMessages(c.id);
    markSeen(c.id, c.messageCount);
    setNotes(null);
    refreshNotes(c.id);

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
    // Checked for every conversation (not just repair-tracking ones)
    // since the "Create Order" button (below) needs to know whether one
    // already exists for this conversation before offering to create one.
    setRepairForSelected(undefined);
    fetch(`/api/admin/repairs?businessId=${encodeURIComponent(c.businessId)}`)
      .then((r) => r.json())
      .then((d: { appointments: RepairAppointment[] }) =>
        setRepairForSelected(d.appointments.find((a) => a.trackingToken === c.id) ?? null)
      );

    setContactForSelected(undefined);
  }

  // Contact record is resolved once we know the customer's phone — from
  // whichever of Order/Repair Details finishes loading first (the same
  // findByPhone matching ContactService.upsert() uses to dedupe).
  useEffect(() => {
    const phone = repairForSelected?.phone ?? orderForSelected?.phone;
    if (!phone || !selected) {
      if (orderForSelected === null && (repairForSelected === null || repairForSelected === undefined)) {
        setContactForSelected(null);
      }
      return;
    }
    fetch(`/api/admin/crm/contacts?businessId=${encodeURIComponent(selected.businessId)}&phone=${encodeURIComponent(phone)}`)
      .then((r) => r.json())
      .then((d: { contact: Contact | null }) => setContactForSelected(d.contact));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderForSelected, repairForSelected, selectedId]);

  async function createOrderFromChat() {
    if (!selected || !newOrderForm.phone.trim() || !newOrderForm.deviceType.trim() || !newOrderForm.issueDescription.trim()) return;
    setSavingNewOrder(true);
    try {
      const res = await fetch("/api/admin/repairs/order-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: selected.businessId,
          conversationId: selected.id,
          customerName: displayName(selected),
          phone: newOrderForm.phone,
          deviceType: newOrderForm.deviceType,
          issueDescription: newOrderForm.issueDescription,
        }),
      });
      if (res.ok) {
        const appointment = await res.json();
        setRepairForSelected(appointment);
        setCreatingOrder(false);
        setNewOrderForm({ phone: "", deviceType: "", issueDescription: "" });
      }
    } finally {
      setSavingNewOrder(false);
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

  async function addNote() {
    if (!selectedId || !newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/admin/handoffs/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, author: currentUsername, body: newNote }),
      });
      if (res.ok) {
        setNewNote("");
        refreshNotes(selectedId);
      }
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(id: string) {
    if (!selectedId) return;
    await fetch(`/api/admin/handoffs/notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setNotes((prev) => prev?.filter((n) => n.id !== id) ?? prev);
  }

  const [settingStatus, setSettingStatus] = useState(false);

  async function setAiStatus(status: "bot" | "human") {
    if (!selectedId) return;
    setSettingStatus(true);
    try {
      await fetch("/api/admin/handoffs/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedId, status }),
      });
      refresh();
    } finally {
      setSettingStatus(false);
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
    <section>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Inbox</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Every conversation across all channels — manage replies, assign agents, and track status.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusTab(tab.id)}
            className="ghost"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: "var(--radius-full)",
              background: statusTab === tab.id ? "var(--accent-subtle)" : "transparent",
              color: statusTab === tab.id ? "var(--accent)" : "var(--text-muted)",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {tab.label}
            <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8, fontSize: 11 }}>{tabCounts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={{ padding: "8px 12px", fontSize: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)" }}>
          <option value="">All channels</option>
          <option value="website">Website</option>
          <option value="messenger">Messenger</option>
          <option value="instagram">Instagram</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)} style={{ padding: "8px 12px", fontSize: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)" }}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, alignItems: "flex-start" }}>
        <div
          style={{
            display: isMobile && selected ? "none" : "block",
            width: isMobile ? "100%" : 320,
            flexShrink: 0,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            maxHeight: isMobile ? "none" : 640,
            overflowY: "auto",
          }}
        >
          {!conversations && <p style={{ padding: 16, fontSize: 13, color: "var(--text-muted)" }}>Loading...</p>}
          {conversations && visibleConversations.length === 0 && <p style={{ padding: 16, fontSize: 13, color: "var(--text-muted)" }}>No conversations yet.</p>}
          {visibleConversations.map((c) => {
            const ch = CHANNEL_LABEL[c.channel] ?? { color: "#8b96a8", label: c.channel };
            const unread = selectedId !== c.id && c.messageCount > (seenCounts[c.id] ?? 0);
            const name = displayName(c);
            return (
              <div
                key={c.id}
                onClick={() => openConversation(c)}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                  cursor: "pointer",
                  display: "flex",
                  gap: 12,
                  background: selectedId === c.id ? "var(--accent-subtle)" : "transparent",
                  borderLeft: selectedId === c.id ? "3px solid var(--accent)" : "3px solid transparent",
                  transition: "background 0.1s ease",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "var(--radius-md)",
                    background: selectedId === c.id ? "var(--accent)" : "var(--surface)",
                    color: selectedId === c.id ? "white" : "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {initials(name)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                      {unread && (
                        <span title="Unread" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                      )}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-faint)", flexShrink: 0 }}>{new Date(c.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {c.lastMessage && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.lastMessage}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                    <span style={{ 
                      fontSize: 10, 
                      padding: "2px 8px", 
                      borderRadius: "var(--radius-full)", 
                      background: "var(--surface)", 
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}>
                      <ChannelDot channel={c.channel} />
                      {ch.label}
                    </span>
                    {agentName(c.assignedAgentId) && (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--accent-subtle)", color: "var(--accent)" }}>
                        → {agentName(c.assignedAgentId)}
                      </span>
                    )}
                    {(conversationTags[c.id] ?? []).map((t) => (
                      <span
                        key={t.tagId}
                        style={{ fontSize: 10, padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--surface)", border: "1px solid var(--border)" }}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          {nextCursor && (
            <div style={{ padding: 12 }}>
              <button onClick={loadMore} disabled={loadingMore} className="ghost" style={{ width: "100%", fontSize: 12 }}>
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, width: isMobile ? "100%" : undefined, display: isMobile && !selected ? "none" : "block" }}>
          {!selected && (
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 40, textAlign: "center" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" style={{ margin: "0 auto 16px" }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>Select a conversation to view</p>
              <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "8px 0 0" }}>Choose from the list on the left</p>
            </div>
          )}
          {selected && (
            <>
              {isMobile && (
                <button
                  onClick={() => setSelectedId(null)}
                  className="ghost"
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 6-6 6 6 6" />
                  </svg>
                  Back to Inbox
                </button>
              )}
              
              {/* Conversation Header */}
              <div style={{ 
                background: "var(--bg-elevated)", 
                border: "1px solid var(--border)", 
                borderRadius: "var(--radius-md)", 
                padding: "16px 20px", 
                marginBottom: 16,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "var(--radius-md)",
                      background: "var(--accent)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    {initials(displayName(selected))}
                  </div>
                  <div>
                    <strong style={{ fontSize: 14 }}>{displayName(selected)}</strong>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ 
                        display: "inline-flex", 
                        alignItems: "center", 
                        gap: 4, 
                        padding: "2px 8px", 
                        borderRadius: "var(--radius-full)", 
                        background: "var(--surface)", 
                        border: "1px solid var(--border)", 
                        fontSize: 11, 
                        color: "var(--text-muted)" 
                      }}>
                        <ChannelDot channel={selected.channel} />
                        {CHANNEL_LABEL[selected.channel]?.label ?? selected.channel}
                      </span>
                    </div>
                  </div>
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: "var(--radius-full)",
                    background: selected.handoffStatus === "bot" ? "var(--success-subtle)" : selected.handoffStatus === "pending" ? "var(--warning-subtle)" : "var(--accent-subtle)",
                    color: selected.handoffStatus === "bot" ? "var(--success)" : selected.handoffStatus === "pending" ? "var(--warning)" : "var(--accent)",
                  }}
                >
                  {selected.handoffStatus === "bot" ? "AI Handling" : selected.handoffStatus === "pending" ? "Needs Handoff" : "Human Handling"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, alignItems: "flex-start" }}>
                {/* Messages */}
                <div style={{ flex: 1, minWidth: 0, width: isMobile ? "100%" : undefined }}>
                  <div style={{ 
                    background: "var(--bg-elevated)", 
                    border: "1px solid var(--border)", 
                    borderRadius: "var(--radius-md)", 
                    minHeight: 300, 
                    maxHeight: isMobile ? 340 : 440, 
                    overflowY: "auto", 
                    padding: 16, 
                    display: "flex", 
                    flexDirection: "column", 
                    gap: 14 
                  }}>
                    {!messages && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading messages...</p>}
                    {messages?.map((m) => {
                      if (m.role === "system") {
                        return (
                          <div key={m.id} style={{ alignSelf: "center", fontSize: 11, color: "var(--text-faint)", textAlign: "center", padding: "4px 12px", background: "var(--surface)", borderRadius: "var(--radius-full)" }}>
                            {m.content} · {new Date(m.createdAt).toLocaleString()}
                          </div>
                        );
                      }
                      const isCustomer = m.role === "user";
                      return (
                        <div key={m.id} style={{ display: "flex", gap: 8, flexDirection: isCustomer ? "row" : "row-reverse", maxWidth: "80%", alignSelf: isCustomer ? "flex-start" : "flex-end" }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "var(--radius-sm)",
                              flexShrink: 0,
                              background: isCustomer ? "var(--surface)" : "var(--accent)",
                              color: isCustomer ? "var(--text-muted)" : "white",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 600,
                              fontSize: 10,
                            }}
                          >
                            {isCustomer ? initials(displayName(selected)) : "AI"}
                          </div>
                          <div style={{ textAlign: isCustomer ? "left" : "right" }}>
                            <div
                              style={{
                                background: isCustomer ? "var(--surface)" : "var(--accent)",
                                color: isCustomer ? "var(--text)" : "white",
                                border: isCustomer ? "1px solid var(--border)" : "none",
                                borderRadius: isCustomer ? "12px 12px 12px 4px" : "12px 12px 4px 12px",
                                padding: "10px 14px",
                                fontSize: 13,
                                textAlign: "left",
                                display: "inline-block",
                                lineHeight: 1.5,
                              }}
                            >
                              {isCustomer ? m.content : <MarkdownMessage text={m.content} />}
                            </div>
                            {!isCustomer && m.provider && (
                              <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4, display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                                via {m.provider}
                                <ReasoningInfo provider={m.provider} confidence={m.confidence} sources={m.sources} />
                              </div>
                            )}
                            <div style={{ marginTop: 4 }}>
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
                  
                  {/* Reply Input */}
                  <div style={{ 
                    display: "flex", 
                    gap: 8, 
                    marginTop: 12,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: 12,
                  }}>
                    <input
                      style={{ 
                        flex: 1, 
                        padding: "10px 14px", 
                        fontSize: 13, 
                        background: "var(--surface)", 
                        border: "1px solid var(--border)", 
                        borderRadius: "var(--radius-sm)", 
                        color: "var(--text)" 
                      }}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") sendReply();
                      }}
                      placeholder="Type your reply..."
                    />
                    <button onClick={sendReply} disabled={sending} className="primary" style={{ padding: "10px 20px", fontSize: 13 }}>
                      {sending ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>

                {/* Detail Panel */}
                <div style={{ width: isMobile ? "100%" : 280, flexShrink: 0 }}>
                  <div style={{ 
                    background: "var(--bg-elevated)", 
                    border: "1px solid var(--border)", 
                    borderRadius: "var(--radius-md)", 
                    padding: 16 
                  }}>
                    {/* AI Controls */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                      <button
                        onClick={() => setAiStatus("human")}
                        disabled={settingStatus || selected.handoffStatus === "human"}
                        style={{ 
                          flex: 1, 
                          fontSize: 12, 
                          padding: "10px 12px",
                          background: selected.handoffStatus === "human" ? "var(--danger-subtle)" : "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          color: selected.handoffStatus === "human" ? "var(--danger)" : "var(--text-secondary)",
                          fontWeight: 500,
                        }}
                      >
                        Stop AI
                      </button>
                      <button
                        onClick={() => setAiStatus("bot")}
                        disabled={settingStatus || selected.handoffStatus === "bot"}
                        style={{ 
                          flex: 1, 
                          fontSize: 12, 
                          padding: "10px 12px",
                          background: selected.handoffStatus === "bot" ? "var(--success-subtle)" : "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          color: selected.handoffStatus === "bot" ? "var(--success)" : "var(--text-secondary)",
                          fontWeight: 500,
                        }}
                      >
                        Resume AI
                      </button>
                    </div>

                    {/* Agent Assignment */}
                    {businessId && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                          Assigned Agent
                        </div>
                        <select
                          value={selected.assignedAgentId ?? ""}
                          onChange={(e) => reassignSelected(e.target.value || null)}
                          disabled={reassigning}
                          style={{ 
                            width: "100%", 
                            padding: "8px 12px", 
                            fontSize: 12, 
                            background: "var(--surface)", 
                            border: "1px solid var(--border)", 
                            borderRadius: "var(--radius-sm)", 
                            color: "var(--text)" 
                          }}
                        >
                          <option value="">Unassigned</option>
                          {agentsForBusiness.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.username} {a.online ? "(online)" : "(offline)"}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Contact Details */}
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                        Contact Details
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "var(--text-muted)" }}>Name</span>
                          <span style={{ color: "var(--text)" }}>{displayName(selected)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "var(--text-muted)" }}>Channel ID</span>
                          <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{selected.externalUserId ?? "—"}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "var(--text-muted)" }}>Channel</span>
                          <span style={{ color: "var(--text)" }}>{CHANNEL_LABEL[selected.channel]?.label ?? selected.channel}</span>
                        </div>
                      </div>
                    </div>

                    {contactForSelected !== undefined && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                          CRM Contact
                        </div>
                        {contactForSelected ? (
                          <div style={{ fontSize: 12 }}>
                            <div style={{ color: "var(--text)" }}>{contactForSelected.name}</div>
                            {contactForSelected.email && <div style={{ color: "var(--text-muted)", marginTop: 2 }}>{contactForSelected.email}</div>}
                            <div style={{ color: "var(--text-faint)", marginTop: 4, fontSize: 10 }}>{shortId(contactForSelected.id)}</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No linked contact record</span>
                        )}
                      </div>
                    )}

                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                        Notes
                      </div>
                    <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 0, marginBottom: 8 }}>
                      Private to your team — never sent to the customer.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                      {notes === null && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading...</span>}
                      {notes !== null && notes.length === 0 && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No notes yet</span>}
                      {notes?.map((n) => (
                        <div key={n.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 10, fontSize: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, color: "var(--text)" }}>{n.author}</span>
                            <button onClick={() => deleteNote(n.id)} className="ghost" style={{ color: "var(--text-faint)", fontSize: 10, padding: 0 }}>×</button>
                          </div>
                          <div style={{ whiteSpace: "pre-wrap", color: "var(--text-secondary)" }}>{n.body}</div>
                          <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>{new Date(n.createdAt).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Leave a note for your team..."
                      style={{ 
                        width: "100%", 
                        padding: "8px 12px", 
                        fontSize: 12, 
                        boxSizing: "border-box", 
                        minHeight: 60, 
                        resize: "vertical",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text)",
                      }}
                    />
                    <button onClick={addNote} disabled={savingNote || !newNote.trim()} className="ghost" style={{ fontSize: 11, padding: "6px 10px", marginTop: 6 }}>
                      {savingNote ? "Saving..." : "+ Add note"}
                    </button>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                      Tags
                    </div>
                    <MessageTagControl
                      catalog={tagCatalog}
                      applied={conversationTags[selected.id] ?? []}
                      onAssign={(tagId) => assignConversationTag(selected.id, tagId)}
                      onRemove={(tagId) => removeConversationTag(selected.id, tagId)}
                    />
                  </div>

                  {selected.channel === "repair-tracking" && repairForSelected !== undefined && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                        Repair Details
                      </div>
                      {repairForSelected ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "var(--text-muted)" }}>Order ID</span>
                            <span style={{ color: "var(--text)" }}>{shortId(repairForSelected.id)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "var(--text-muted)" }}>Customer</span>
                            <span style={{ color: "var(--text)" }}>{repairForSelected.customerName}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "var(--text-muted)" }}>Device</span>
                            <span style={{ color: "var(--text)" }}>{repairForSelected.deviceType}{repairForSelected.deviceModel ? ` — ${repairForSelected.deviceModel}` : ""}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "var(--text-muted)" }}>Appointment</span>
                            <span style={{ color: "var(--text)" }}>{new Date(repairForSelected.appointmentDate).toLocaleString()}</span>
                          </div>
                          <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>{repairForSelected.issueDescription}</div>
                          <select
                            value={repairForSelected.status}
                            onChange={(e) => updateRepairStatus(e.target.value)}
                            disabled={savingRepairStatus}
                            style={{ 
                              padding: "8px 12px", 
                              fontSize: 12,
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                              color: "var(--text)",
                            }}
                          >
                            {REPAIR_STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>{REPAIR_STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No appointment found for this conversation.</p>
                      )}
                    </div>
                  )}

                  {selected.channel !== "repair-tracking" && orderForSelected !== undefined && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                        Order
                      </div>
                      {orderForSelected ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "var(--text-muted)" }}>Order ID</span>
                            <span style={{ color: "var(--text)" }}>{shortId(orderForSelected.id)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "var(--text-muted)" }}>Customer</span>
                            <span style={{ color: "var(--text)" }}>{orderForSelected.customerName}</span>
                          </div>
                          <div style={{ color: "var(--text-secondary)" }}>{orderForSelected.products}</div>
                          <div style={{ color: "var(--text-muted)" }}>{orderForSelected.deliveryAddress}</div>
                          <div style={{ color: "var(--text-muted)" }}>{orderForSelected.paymentMethod} · {orderForSelected.phone}</div>
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No order for this conversation.</p>
                      )}
                    </div>
                  )}

                  {selected.channel !== "repair-tracking" && repairForSelected !== undefined && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                        Order Management
                      </div>
                      {repairForSelected ? (
                        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          Order {repairForSelected.serialNumber ?? shortId(repairForSelected.id)} already created for this chat — manage it from the Order Management tab.
                        </p>
                      ) : creatingOrder ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <input
                            placeholder="Phone *"
                            value={newOrderForm.phone}
                            onChange={(e) => setNewOrderForm({ ...newOrderForm, phone: e.target.value })}
                            style={{ padding: 6, fontSize: 12 }}
                          />
                          <input
                            placeholder="Device type *"
                            value={newOrderForm.deviceType}
                            onChange={(e) => setNewOrderForm({ ...newOrderForm, deviceType: e.target.value })}
                            style={{ padding: 6, fontSize: 12 }}
                          />
                          <input
                            placeholder="Issue *"
                            value={newOrderForm.issueDescription}
                            onChange={(e) => setNewOrderForm({ ...newOrderForm, issueDescription: e.target.value })}
                            style={{ padding: 6, fontSize: 12 }}
                          />
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={createOrderFromChat} disabled={savingNewOrder} className="primary" style={{ fontSize: 12, padding: "6px 10px" }}>
                              {savingNewOrder ? "Creating…" : "Create"}
                            </button>
                            <button onClick={() => setCreatingOrder(false)} style={{ fontSize: 12, padding: "6px 10px" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setCreatingOrder(true)} style={{ fontSize: 12, padding: "6px 10px" }}>
                          + Create Order
                        </button>
                      )}
                    </div>
                  )}

                  {summaryBySession[selected.id] && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                        Summary
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{summaryBySession[selected.id]}</p>
                    </div>
                  )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
