"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { shortId } from "./dashboard-styles";
import { MasterDetail, PaneHeader, SegmentedControl } from "./MasterDetail";
import { MessageTagControl } from "./MessageTagControl";
import { MarkdownMessage } from "./MarkdownMessage";
import { NavIcon } from "./nav-icons";
import { ReasoningInfo } from "./ReasoningInfo";
import { showConfirm } from "../lib/app-dialog";

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
  email?: string;
  deviceType: string;
  deviceModel?: string;
  issueDescription: string;
  appointmentDate: string;
  status: string;
  serialNumber?: string;
  isWalkIn?: boolean;
  source?: string;
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

const CHANNEL_LABEL: Record<string, { label: string; icon: string }> = {
  website: { label: "Website", icon: "website" },
  messenger: { label: "Messenger", icon: "messenger" },
  instagram: { label: "Instagram", icon: "instagram" },
  whatsapp: { label: "WhatsApp", icon: "whatsapp" },
  "repair-tracking": { label: "Repair tracking", icon: "repairs" },
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

type SortOption = "newest" | "oldest";
type StatusTab = "all" | "handoff" | "human";

const NAV_ICON: Record<StatusTab, string> = {
  all: "allchats",
  handoff: "handoffs",
  human: "clients",
};

const HANDOFF_LAMP: Record<string, string> = {
  bot: "lamp lamp-machine",
  pending: "lamp lamp-warn",
  human: "lamp lamp-info",
};

const HANDOFF_LABEL: Record<string, string> = {
  bot: "AI handling",
  pending: "Needs handoff",
  human: "Human handling",
};

const REPAIR_LAMP: Record<string, string> = {
  booked: "lamp lamp-info",
  received: "lamp lamp-idle",
  in_repair: "lamp lamp-warn",
  ready: "lamp lamp-ok",
  completed: "lamp lamp-ok",
  cancelled: "lamp lamp-err",
};

/* Chat is the product: three hairline-separated panes, one ink accent,
 * lamps for status, monospace for every number. Layout constants keep
 * the three panes speaking the same rhythm. */
const NAV_ITEM: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "100%",
  marginBottom: 2,
  border: "none",
  borderRadius: "var(--r-sm)",
  fontSize: 13,
  textAlign: "left",
  transition: "background var(--dur-state) ease, color var(--dur-state) ease",
};

const PANE_HEAD: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 12px",
  borderBottom: "1px solid var(--line-soft)",
  background: "var(--panel)",
};

const SEARCH_FIELD: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  background: "var(--panel-sunk)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
};

const ROW: CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "10px 12px",
  borderBottom: "1px solid var(--line-soft)",
  cursor: "pointer",
  transition: "background var(--dur-state) ease",
  outlineOffset: -2,
};

const AVATAR: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
  fontSize: 12,
};

const CHAT_HEAD: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 16px",
  borderBottom: "1px solid var(--line-soft)",
  background: "var(--panel)",
};

const BUBBLE: CSSProperties = {
  padding: "9px 13px",
  fontSize: 13,
  lineHeight: 1.55,
  textAlign: "left",
  color: "var(--ink)",
  borderRadius: "var(--r-md)",
};

const META_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 5,
};

const RAIL_SECTION: CSSProperties = { marginBottom: 18 };

const RAIL_LABEL: CSSProperties = { display: "block", marginBottom: 7 };

const RAIL_ROW: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 12.5,
  lineHeight: 1.65,
};

const RAIL_KEY: CSSProperties = { color: "var(--ink-3)", flexShrink: 0 };

const RAIL_VALUE: CSSProperties = {
  color: "var(--ink)",
  textAlign: "right",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** Intercom-style unified inbox — every real conversation regardless of
 * channel or handoff status, in one place. Conversation list + a
 * transcript viewer + a detail panel, same pattern as Training Arena's
 * session sidebar. Reuses existing endpoints throughout (messages, tags,
 * handoffs, orders) rather than inventing new ones. */
const MOBILE_BREAKPOINT = 860;

export function AllChatsPanel({ businessId, active = true, businessType, accountRole, onBack }: { businessId?: string; active?: boolean; businessType?: string; accountRole?: string | null; onBack?: () => void }) {
  const canDelete = accountRole === "owner" || accountRole === "admin";
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Below MOBILE_BREAKPOINT the fixed 280px list + 240px detail columns
  // (real bug, confirmed live: forced ~520px+ of side columns alone
  // inside a 375px viewport) collapse into a single-column, one-thing-
  // at-a-time flow instead: list, OR thread+detail with a back button —
  // same pattern DashboardShell's own sidebar already uses.
  //
  // This panel's OWN width, not window.innerWidth -- confirmed live: a
  // 1024px browser window still leaves this panel only ~716px once
  const [channelFilter, setChannelFilter] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [listCollapsed, setListCollapsed] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

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
  // Cached by businessId (not per-conversation) since many conversations
  // share the same client -- avoids refetching on every row click. Used
  // to hide Stop/Resume AI entirely once a client's AI Replies toggle
  // (Client Access panel) is off, since flipping one conversation back
  // to "bot" would be a no-op lie while the whole client's AI is off.
  const [businessAiEnabled, setBusinessAiEnabled] = useState<Record<string, boolean>>({});
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
    // The Inbox sidebar badge (client-dashboard-client.tsx) reads this
    // same localStorage key -- dispatch so it updates immediately in
    // this tab too, not just on its next poll (native `storage` only
    // fires in OTHER tabs).
    window.dispatchEvent(new Event("aiva-inbox-seen-updated"));
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

    if (!(c.businessId in businessAiEnabled)) {
      fetch(`/api/admin/clients/${encodeURIComponent(c.businessId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { aiEnabled?: boolean } | null) => {
          if (d) setBusinessAiEnabled((prev) => ({ ...prev, [c.businessId]: d.aiEnabled !== false }));
        });
    }

    setContactForSelected(undefined);
  }

  async function deleteConversation(c: ConversationSummary) {
    const confirmed = await showConfirm(
      `Delete the conversation with "${displayName(c)}"? The whole message thread is removed and this cannot be undone.`
    );
    if (!confirmed) return;

    const res = await fetch(`/api/admin/conversations/${encodeURIComponent(c.id)}`, { method: "DELETE" });
    if (!res.ok) return;
    if (selectedId === c.id) setSelectedId(null);
    setConversations((prev) => prev?.filter((x) => x.id !== c.id) ?? prev);
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

  const tabCounts: Record<StatusTab, number> = {
    all: conversations?.length ?? 0,
    handoff: conversations?.filter((c) => c.handoffStatus === "pending").length ?? 0,
    human: conversations?.filter((c) => c.handoffStatus === "human").length ?? 0,
  };

  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = visibleConversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = displayName(c).toLowerCase();
    const msg = (c.lastMessage ?? "").toLowerCase();
    return name.includes(q) || msg.includes(q);
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

return (
    <MasterDetail
      listLabel="Conversations"
      contextLabel="Conversation details"
      hasSelection={Boolean(selectedId)}
      onBack={() => setSelectedId(null)}
      listCollapsed={listCollapsed}
      onListCollapsedChange={setListCollapsed}
      contextOpen={contextOpen}
      onContextOpenChange={setContextOpen}
      list={
        <>
          {onBack && listCollapsed && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to sections"
              title="Back to dashboard"
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", borderBottom: "1px solid var(--line-soft)", background: "var(--panel)", color: "var(--ink-2)", fontSize: 12.5, fontWeight: 500, cursor: "pointer", textAlign: "left", borderRadius: 0 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
          )}
          <PaneHeader title="Conversations" count={filteredConversations.length} />
          <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--line-soft)", background: "var(--panel)" }}>
            <SegmentedControl
              ariaLabel="Conversation views"
              value={statusTab}
              onChange={(v) => setStatusTab(v)}
              options={(businessType === "repair"
                ? [{ id: "all" as StatusTab, label: "All", count: tabCounts.all }]
                : [
                    { id: "all" as StatusTab, label: "All", count: tabCounts.all },
                    { id: "handoff" as StatusTab, label: "Needs attention", count: tabCounts.handoff },
                    { id: "human" as StatusTab, label: "Human handling", count: tabCounts.human },
                  ])}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field" style={{ flex: 1, minWidth: 0 }}>
                <label className="field-label" htmlFor="aiva-inbox-channel">Channel</label>
                <select id="aiva-inbox-channel" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={{ fontSize: 12.5 }}>
                  <option value="">All channels</option>
                  <option value="website">Website</option>
                  <option value="messenger">Messenger</option>
                  <option value="instagram">Instagram</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 0 }}>
                <label className="field-label" htmlFor="aiva-inbox-sort">Sort</label>
                <select id="aiva-inbox-sort" value={sort} onChange={(e) => setSort(e.target.value as SortOption)} style={{ fontSize: 12.5 }}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            </div>
          </div>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--line-soft)", background: "var(--panel)" }}>
            <div className="field">
              <label className="field-label" htmlFor="aiva-search-conversations">Search</label>
              <div style={SEARCH_FIELD}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-4)" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  id="aiva-search-conversations"
                  type="search"
                  name="aiva-search-conversations"
                  autoComplete="off"
                  placeholder="Name or last message"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ flex: 1, background: "none", border: "none", padding: "8px 0", fontSize: 13, color: "var(--ink)" }}
                />
              </div>
            </div>
          </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {!conversations && (
            <div style={{ padding: 12 }}>
              <div className="skeleton" style={{ height: 56, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 56, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 56 }} />
            </div>
          )}

          {conversations && filteredConversations.length === 0 && (
            <div className="empty-state" style={{ margin: 12 }}>
              <div className="empty-state-title">No conversations</div>
              <div className="empty-state-description">
                {searchQuery.trim()
                  ? "No thread matches this search. Clear it to see the whole inbox."
                  : "Threads land here as customers message the business."}
              </div>
            </div>
          )}

          {filteredConversations.map((c) => {
            const name = displayName(c);
            const isActive = selectedId === c.id;
            const unreadCount = Math.max(0, c.messageCount - (seenCounts[c.id] ?? 0));
            const unread = !isActive && unreadCount > 0;
            const channel = CHANNEL_LABEL[c.channel] ?? { label: c.channel, icon: "channels" };
            const assigned = agentName(c.assignedAgentId);
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                aria-current={isActive ? "true" : undefined}
                onClick={() => openConversation(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openConversation(c);
                  }
                }}
                style={{
                  ...ROW,
                  background: isActive ? "var(--accent-subtle)" : "transparent",
                  boxShadow: isActive ? "inset 3px 0 0 var(--accent)" : "inset 3px 0 0 transparent",
                }}
              >
                <div
                  style={{
                    ...AVATAR,
                    background: isActive ? "var(--accent)" : "var(--panel-sunk)",
                    color: isActive ? "var(--accent-ink)" : "var(--ink-2)",
                    border: isActive ? "1px solid var(--accent)" : "1px solid var(--line)",
                  }}
                >
                  {initials(name)}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: unread ? 700 : 500,
                        color: "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {name}
                    </span>
                    <span className="data" style={{ fontSize: 11, color: "var(--ink-4)", flexShrink: 0 }}>
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.45,
                      marginTop: 2,
                      color: unread ? "var(--ink-2)" : "var(--ink-3)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.lastMessage ?? "No messages yet"}
                  </div>

                  <div style={META_ROW}>
                    <span className="data" style={{ fontSize: 11, color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <NavIcon id={channel.icon} style={{ color: "var(--ink-4)" }} />
                      {channel.label}
                    </span>
                    {c.handoffStatus === "pending" && <span className="lamp lamp-warn">Needs handoff</span>}
                    {assigned && (
                      <span className="data" style={{ fontSize: 11, color: "var(--accent)" }}>{assigned}</span>
                    )}
                    {(conversationTags[c.id] ?? []).slice(0, 1).map((t) => (
                      <span
                        key={t.tagId}
                        className="data"
                        style={{
                          fontSize: 11,
                          padding: "0 6px",
                          borderRadius: "var(--r-pill)",
                          border: "1px solid var(--line)",
                          color: "var(--ink-2)",
                        }}
                      >
                        {t.label}
                      </span>
                    ))}
                    <span
                      className="data"
                      style={{
                        marginLeft: "auto",
                        fontSize: 11,
                        fontWeight: unread ? 700 : 500,
                        color: unread ? "var(--accent)" : "var(--ink-4)",
                      }}
                    >
                      {unreadCount > 0 ? `${unreadCount} new` : `${c.messageCount} msg`}
                    </span>
                  </div>
                </div>

                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(c);
                    }}
                    className="plain"
                    aria-label={`Delete conversation with ${name}`}
                    title="Delete conversation"
                    style={{
                      alignSelf: "center",
                      width: 26,
                      height: 26,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "var(--r-xs)",
                      color: "var(--ink-4)",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}

          {nextCursor && (
            <div style={{ padding: 12 }}>
              <button onClick={loadMore} disabled={loadingMore} className="ghost" style={{ width: "100%", fontSize: 12.5 }}>
                {loadingMore ? "Loading" : "Load more"}
              </button>
            </div>
          )}
          </div>
        </>
      }
      detail={
        <>
          {!selected ? (
          <div className="empty-state" style={{ margin: "auto", maxWidth: 380, borderStyle: "solid" }}>
            <NavIcon id="allchats" className="empty-state-icon" />
            <div className="empty-state-title">Select a conversation</div>
            <div className="empty-state-description">
              Customer messages, AI replies and the order or repair context for one thread all live here.
            </div>
          </div>
        ) : (
          <>
            <div style={CHAT_HEAD}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    ...AVATAR,
                    width: 32,
                    height: 32,
                    background: "var(--panel-sunk)",
                    border: "1px solid var(--line)",
                    color: "var(--ink-2)",
                  }}
                >
                  {initials(displayName(selected))}
                </div>
                <span style={{ minWidth: 0 }}>
                  <strong
                    style={{
                      display: "block",
                      fontSize: 13.5,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayName(selected)}
                  </strong>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                    <span className="data" style={{ fontSize: 11, color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <NavIcon id={CHANNEL_LABEL[selected.channel]?.icon ?? "channels"} style={{ color: "var(--ink-4)" }} />
                      {CHANNEL_LABEL[selected.channel]?.label ?? selected.channel}
                    </span>
                    <span className="data" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                      {new Date(selected.updatedAt).toLocaleString()}
                    </span>
                  </span>
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={HANDOFF_LAMP[selected.handoffStatus] ?? "lamp lamp-idle"}>
                  {HANDOFF_LABEL[selected.handoffStatus] ?? selected.handoffStatus}
                </span>
                <button
                  type="button"
                  className="plain"
                  onClick={() => setListCollapsed(!listCollapsed)}
                  aria-pressed={listCollapsed}
                  aria-label={listCollapsed ? "Show conversation list" : "Hide conversation list"}
                  title={listCollapsed ? "Show list  [" : "Hide list  ["}
                  style={{ padding: 4, color: "var(--ink-3)", display: "flex" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /></svg>
                </button>
                <button
                  type="button"
                  className="plain"
                  onClick={() => setContextOpen(!contextOpen)}
                  aria-pressed={contextOpen}
                  aria-label={contextOpen ? "Hide details panel" : "Show details panel"}
                  title={contextOpen ? "Hide details  ]" : "Show details  ]"}
                  style={{ padding: 4, color: "var(--ink-3)", display: "flex" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" /></svg>
                </button>
              </span>
            </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                  {!messages && (
                    <div className="empty-state">
                      <div className="empty-state-title">Loading messages</div>
                      <div className="empty-state-description">Fetching the thread for this conversation.</div>
                    </div>
                  )}

                  {messages?.length === 0 && selected.channel === "repair-tracking" && repairForSelected && (
                    <div
                      className="machine-block"
                      style={{ alignSelf: "center", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px" }}
                    >
                      <span className="lamp lamp-machine">Appointment booked</span>
                      <span className="data" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
                        {REPAIR_STATUS_LABEL[repairForSelected.status] ?? repairForSelected.status}
                      </span>
                      <span className="data" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                        {new Date(repairForSelected.appointmentDate).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {messages?.map((m) => {
                    if (m.role === "system") {
                      return (
                        <div
                          key={m.id}
                          className="machine-block"
                          style={{
                            alignSelf: "center",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                            maxWidth: "82%",
                            padding: "7px 12px",
                          }}
                        >
                          <span className="lamp lamp-idle">{m.content}</span>
                          <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                            {new Date(m.createdAt).toLocaleString()}
                          </span>
                        </div>
                      );
                    }

                    const isCustomer = m.role === "user";
                    const isMachine = !isCustomer && !!m.provider;
                    const fromRight = !isCustomer;
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          gap: 8,
                          flexDirection: fromRight ? "row-reverse" : "row",
                          maxWidth: "82%",
                          alignSelf: fromRight ? "flex-end" : "flex-start",
                        }}
                      >
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 600,
                            fontSize: 10,
                            background: isMachine
                              ? "var(--machine-subtle)"
                              : isCustomer
                                ? "var(--panel-sunk)"
                                : "var(--accent-subtle)",
                            border: "1px solid " + (isMachine
                              ? "var(--machine-line)"
                              : isCustomer
                                ? "var(--line)"
                                : "var(--accent-line)"),
                            color: isMachine ? "var(--machine)" : isCustomer ? "var(--ink-2)" : "var(--accent)",
                          }}
                        >
                          {isCustomer ? initials(displayName(selected)) : <NavIcon id={isMachine ? "brain" : "staff"} style={{ color: "inherit" }} />}
                        </div>

                        <div style={{ minWidth: 0, textAlign: fromRight ? "right" : "left" }}>
                          {isMachine ? (
                            <div className="machine-block" style={{ ...BUBBLE, display: "inline-block", textAlign: "left" }}>
                              <MarkdownMessage text={m.content} />
                            </div>
                          ) : (
                            <div
                              style={{
                                ...BUBBLE,
                                display: "inline-block",
                                background: isCustomer ? "var(--panel-sunk)" : "var(--panel)",
                                border: "1px solid " + (isCustomer ? "var(--line)" : "var(--accent-line)"),
                                boxShadow: isCustomer ? "none" : "inset 3px 0 0 var(--accent)",
                              }}
                            >
                              {isCustomer ? m.content : <MarkdownMessage text={m.content} />}
                            </div>
                          )}

                          <div style={{ ...META_ROW, justifyContent: fromRight ? "flex-end" : "flex-start" }}>
                            <span className="data" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                              {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {isMachine && m.provider && (
                              <span className="data" style={{ fontSize: 11, color: "var(--machine)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                via {m.provider}
                                <ReasoningInfo provider={m.provider} confidence={m.confidence} sources={m.sources} />
                              </span>
                            )}
                            {!isCustomer && !isMachine && (
                              <span className="data" style={{ fontSize: 11, color: "var(--accent)" }}>Staff</span>
                            )}
                          </div>

                          <div style={{ marginTop: 5 }}>
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

                {/* Reply */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 8,
                    padding: "10px 12px",
                    borderTop: "1px solid var(--line-soft)",
                    background: "var(--panel)",
                  }}
                >
                  <div className="field" style={{ flex: 1 }}>
                    <label className="field-label" htmlFor="aiva-reply-input">Reply</label>
                    <input
                      id="aiva-reply-input"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }}
                      placeholder="Type your reply"
                      style={{ fontSize: 13 }}
                    />
                  </div>
                  <button onClick={sendReply} disabled={sending} className="primary">
                    {sending ? "Sending" : "Send reply"}
                  </button>
                </div>

        </>
        )}
        </>
      }
      context={
        selected ? (
          <div style={{ padding: 14, overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                {/* AI controls -- hidden entirely once this client's AI
                    Replies toggle (Client Access panel) is off. Defaults
                    to shown (true) until the lookup resolves, matching
                    Business.aiEnabled's own default-true. */}
                {businessAiEnabled[selected.businessId] !== false ? (
                  <div style={RAIL_SECTION}>
                    <span className="instrument-label" style={RAIL_LABEL}>AI replies</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => setAiStatus("human")}
                        disabled={settingStatus || selected.handoffStatus === "human"}
                        className={selected.handoffStatus === "human" ? "danger sm" : "ghost sm"}
                        aria-pressed={selected.handoffStatus === "human"}
                        style={{ flex: 1 }}
                      >
                        Stop AI
                      </button>
                      <button
                        onClick={() => setAiStatus("bot")}
                        disabled={settingStatus || selected.handoffStatus === "bot"}
                        className={selected.handoffStatus === "bot" ? "machine sm" : "ghost sm"}
                        aria-pressed={selected.handoffStatus === "bot"}
                        style={{ flex: 1 }}
                      >
                        Resume AI
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="machine-block" style={{ ...RAIL_SECTION, padding: "10px 12px" }}>
                    <span className="lamp lamp-warn">AI replies are off</span>
                    <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.5 }}>
                      Turn them back on in Client Access to let the AI answer this thread.
                    </div>
                  </div>
                )}

                {businessId && (
                  <div style={RAIL_SECTION}>
                    <span className="instrument-label" style={RAIL_LABEL}>Assigned agent</span>
                    <div className="field">
                      <label className="field-label" htmlFor="aiva-assigned-agent">Agent</label>
                      <select
                        id="aiva-assigned-agent"
                        value={selected.assignedAgentId ?? ""}
                        onChange={(e) => reassignSelected(e.target.value || null)}
                        disabled={reassigning}
                        style={{ fontSize: 12.5 }}
                      >
                        <option value="">Unassigned</option>
                        {agentsForBusiness.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.username} {a.online ? "(online)" : "(offline)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div style={RAIL_SECTION}>
                  <span className="instrument-label" style={RAIL_LABEL}>Contact details</span>
                  <div style={RAIL_ROW}>
                    <span style={RAIL_KEY}>Name</span>
                    <span style={RAIL_VALUE}>{displayName(selected)}</span>
                  </div>
                  <div style={RAIL_ROW}>
                    <span style={RAIL_KEY}>Channel ID</span>
                    <span className="data" style={RAIL_VALUE} title={selected.externalUserId ?? ""}>
                      {selected.externalUserId ?? "—"}
                    </span>
                  </div>
                  <div style={RAIL_ROW}>
                    <span style={RAIL_KEY}>Channel</span>
                    <span style={RAIL_VALUE}>{CHANNEL_LABEL[selected.channel]?.label ?? selected.channel}</span>
                  </div>
                </div>

                {contactForSelected !== undefined && (
                  <div style={RAIL_SECTION}>
                    <span className="instrument-label" style={RAIL_LABEL}>CRM contact</span>
                    {contactForSelected ? (
                      <div>
                        <div style={{ fontSize: 12.5, color: "var(--ink)" }}>{contactForSelected.name}</div>
                        {contactForSelected.email && (
                          <div className="data" style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 2, overflowWrap: "anywhere" }}>
                            {contactForSelected.email}
                          </div>
                        )}
                        <div className="data" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>{shortId(contactForSelected.id)}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>No linked contact record</div>
                    )}
                  </div>
                )}

                <div style={RAIL_SECTION}>
                  <span className="instrument-label" style={RAIL_LABEL}>Notes</span>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 8 }}>Private to your team</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                    {notes === null && <div className="skeleton" style={{ height: 48 }} />}
                    {notes !== null && notes.length === 0 && (
                      <div className="empty-state" style={{ padding: "14px 12px" }}>
                        <div className="empty-state-title">No notes yet</div>
                        <div className="empty-state-description">Notes stay inside your team, never in the thread.</div>
                      </div>
                    )}
                    {notes?.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          padding: "9px 10px",
                          fontSize: 12.5,
                          background: "var(--panel-sunk)",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--r-sm)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, color: "var(--ink)" }}>{n.author}</span>
                          <button
                            onClick={() => deleteNote(n.id)}
                            className="plain"
                            aria-label={`Delete note by ${n.author}`}
                            title="Delete note"
                            style={{ padding: 2, color: "var(--ink-4)", display: "flex" }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                          </button>
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)", lineHeight: 1.5 }}>{n.body}</div>
                        <div className="data" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 5 }}>
                          {new Date(n.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="aiva-new-note">Add a note</label>
                    <textarea
                      id="aiva-new-note"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Leave a note"
                      style={{ minHeight: 54, resize: "vertical", fontSize: 12.5 }}
                    />
                  </div>
                  <button onClick={addNote} disabled={savingNote || !newNote.trim()} className="ghost sm" style={{ marginTop: 6 }}>
                    {savingNote ? "Saving" : "Add note"}
                  </button>
                </div>

                <div style={RAIL_SECTION}>
                  <span className="instrument-label" style={RAIL_LABEL}>Tags</span>
                  <MessageTagControl
                    catalog={tagCatalog}
                    applied={conversationTags[selected.id] ?? []}
                    onAssign={(tagId) => assignConversationTag(selected.id, tagId)}
                    onRemove={(tagId) => removeConversationTag(selected.id, tagId)}
                  />
                </div>

                {selected.channel === "repair-tracking" && repairForSelected !== undefined && (
                  <div style={RAIL_SECTION}>
                    <span className="instrument-label" style={RAIL_LABEL}>Repair details</span>
                    {repairForSelected ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                          <span className={REPAIR_LAMP[repairForSelected.status] ?? "lamp lamp-idle"}>
                            {REPAIR_STATUS_LABEL[repairForSelected.status] ?? repairForSelected.status}
                          </span>
                          <span className="data" style={{ fontSize: 11, color: "var(--ink-4)" }}>{shortId(repairForSelected.id)}</span>
                        </div>
                        <div style={RAIL_ROW}>
                          <span style={RAIL_KEY}>Order ID</span>
                          <span className="data" style={RAIL_VALUE}>{shortId(repairForSelected.id)}</span>
                        </div>
                        <div style={RAIL_ROW}>
                          <span style={RAIL_KEY}>Customer</span>
                          <span style={RAIL_VALUE}>{repairForSelected.customerName}</span>
                        </div>
                        <div style={RAIL_ROW}>
                          <span style={RAIL_KEY}>Phone</span>
                          <span className="data" style={RAIL_VALUE}>{repairForSelected.phone}</span>
                        </div>
                        {repairForSelected.email && (
                          <div style={RAIL_ROW}>
                            <span style={RAIL_KEY}>Email</span>
                            <span className="data" style={RAIL_VALUE} title={repairForSelected.email}>
                              {repairForSelected.email}
                            </span>
                          </div>
                        )}
                        <div style={RAIL_ROW}>
                          <span style={RAIL_KEY}>Device</span>
                          <span style={RAIL_VALUE}>
                            {repairForSelected.deviceType}
                            {repairForSelected.deviceModel ? ` — ${repairForSelected.deviceModel}` : ""}
                          </span>
                        </div>
                        <div style={RAIL_ROW}>
                          <span style={RAIL_KEY}>Source</span>
                          <span className="data" style={RAIL_VALUE}>
                            {repairForSelected.source === "website"
                              ? "Website"
                              : repairForSelected.source?.startsWith("walk-in")
                                ? repairForSelected.source
                                : repairForSelected.source
                                  ? repairForSelected.source
                                  : repairForSelected.isWalkIn
                                    ? "Walk-in"
                                    : new Date(repairForSelected.appointmentDate).toLocaleString()}
                          </span>
                        </div>
                        <div style={RAIL_ROW}>
                          <span style={RAIL_KEY}>Tracking code</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(repairForSelected.trackingToken)}
                            className="plain data"
                            title="Copy tracking code"
                            style={{ color: "var(--accent)", fontSize: 11.5 }}
                          >
                            {repairForSelected.trackingToken}
                          </button>
                        </div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 8 }}>
                          {repairForSelected.issueDescription}
                        </div>
                        <div className="field" style={{ marginTop: 10 }}>
                          <label className="field-label" htmlFor="aiva-repair-status">Repair status</label>
                          <select
                            id="aiva-repair-status"
                            value={repairForSelected.status}
                            onChange={(e) => updateRepairStatus(e.target.value)}
                            disabled={savingRepairStatus}
                            style={{ fontSize: 12.5 }}
                          >
                            {REPAIR_STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>{REPAIR_STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : (
                      <div className="empty-state" style={{ padding: "14px 12px" }}>
                        <div className="empty-state-title">No appointment</div>
                        <div className="empty-state-description">This repair thread has no linked appointment record.</div>
                      </div>
                    )}
                  </div>
                )}

                {selected.channel !== "repair-tracking" && orderForSelected !== undefined && (
                  <div style={RAIL_SECTION}>
                    <span className="instrument-label" style={RAIL_LABEL}>Order</span>
                    {orderForSelected ? (
                      <>
                        <div style={RAIL_ROW}>
                          <span style={RAIL_KEY}>Order ID</span>
                          <span className="data" style={RAIL_VALUE}>{shortId(orderForSelected.id)}</span>
                        </div>
                        <div style={RAIL_ROW}>
                          <span style={RAIL_KEY}>Customer</span>
                          <span style={RAIL_VALUE}>{orderForSelected.customerName}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6 }}>{orderForSelected.products}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>{orderForSelected.deliveryAddress}</div>
                        <div className="data" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                          {orderForSelected.paymentMethod}
                        </div>
                        <div className="data" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                          {orderForSelected.phone}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>No order for this conversation.</div>
                    )}
                  </div>
                )}

                {selected.channel !== "repair-tracking" && repairForSelected !== undefined && (
                  <div style={RAIL_SECTION}>
                    <span className="instrument-label" style={RAIL_LABEL}>Order management</span>
                    {repairForSelected ? (
                      <p style={{ fontSize: 12.5, color: "var(--ink-2)", margin: 0 }}>
                        Order {repairForSelected.serialNumber ?? shortId(repairForSelected.id)} already created.
                      </p>
                    ) : creatingOrder ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div className="field">
                          <label className="field-label" htmlFor="aiva-order-phone">Phone</label>
                          <input
                            id="aiva-order-phone"
                            value={newOrderForm.phone}
                            onChange={(e) => setNewOrderForm({ ...newOrderForm, phone: e.target.value })}
                            style={{ fontSize: 12.5 }}
                          />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="aiva-order-device">Device type</label>
                          <input
                            id="aiva-order-device"
                            value={newOrderForm.deviceType}
                            onChange={(e) => setNewOrderForm({ ...newOrderForm, deviceType: e.target.value })}
                            style={{ fontSize: 12.5 }}
                          />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="aiva-order-issue">Issue</label>
                          <textarea
                            id="aiva-order-issue"
                            value={newOrderForm.issueDescription}
                            onChange={(e) => setNewOrderForm({ ...newOrderForm, issueDescription: e.target.value })}
                            style={{ minHeight: 60, resize: "vertical", fontSize: 12.5 }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={createOrderFromChat} disabled={savingNewOrder} className="primary sm">
                            {savingNewOrder ? "Creating" : "Create order"}
                          </button>
                          <button onClick={() => setCreatingOrder(false)} className="ghost sm">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setCreatingOrder(true)} className="ghost sm">
                        Create order
                      </button>
                    )}
                  </div>
                )}

                {summaryBySession[selected.id] && (
                  <div>
                    <span className="instrument-label" style={RAIL_LABEL}>Summary</span>
                    <div style={{ maxWidth: "68ch" }}>
                      <MarkdownMessage text={summaryBySession[selected.id] ?? ""} />
                    </div>
                  </div>
                )}
        </div>
        ) : null
      }
    />
  );
}
