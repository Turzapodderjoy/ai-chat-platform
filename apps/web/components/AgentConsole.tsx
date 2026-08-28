"use client";

import { useEffect, useState } from "react";

import { DashboardShell, type NavGroup } from "./DashboardShell";
import { cardStyle, subtleTextStyle, badgeStyle, primaryButtonStyle } from "./dashboard-styles";

type Tab = "inbox" | "team";

const NAV_GROUPS: NavGroup<Tab>[] = [
  { items: [{ id: "inbox", label: "Inbox" }, { id: "team", label: "Team" }] },
];

interface Agent {
  id: string;
  username: string;
  online: boolean;
  disabled: boolean;
}

interface ConversationSummary {
  id: string;
  channel: string;
  customerName: string | null;
  handoffStatus: string;
  assignedAgentId: string | null;
  updatedAt: string;
  lastMessage: string | null;
}

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

/** The scoped dashboard a business-owner-created agent login lands on
 * -- a completely different, cut-down experience from the normal
 * client dashboard (see client-dashboard-client.tsx's role branch),
 * not the full nav with fewer panels. "Inbox" is the agent's own
 * assigned chats (fully actionable); "Team" is every chat in the
 * business, read-only unless it happens to be assigned to this agent,
 * so an agent can see what teammates are handling for coverage without
 * being able to reply on their behalf. */
export function AgentConsole({
  businessId,
  username,
  accountId,
  onLogout,
}: {
  businessId: string;
  username: string | null;
  accountId: string;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("inbox");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [online, setOnline] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  function refreshRoster() {
    fetch("/api/client/agents")
      .then((r) => r.json())
      .then((d: { agents: Agent[] }) => {
        setAgents(d.agents ?? []);
        const self = d.agents?.find((a) => a.id === accountId);
        if (self) setOnline(self.online);
      });
  }

  function refreshInbox() {
    const scope = tab === "team" ? "team" : "mine";
    fetch(`/api/client/inbox?scope=${scope}`)
      .then((r) => r.json())
      .then((d: { conversations: ConversationSummary[] }) => setConversations(d.conversations ?? []));
  }

  useEffect(refreshRoster, [accountId]);

  useEffect(() => {
    setConversations(null);
    setSelectedId(null);
    refreshInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!selectedId) {
      setMessages(null);
      return;
    }
    fetch(`/api/client/inbox/messages?sessionId=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((d: { messages: Message[] }) => setMessages(d.messages ?? []));
  }, [selectedId]);

  async function togglePresence() {
    const next = !online;
    setOnline(next);
    await fetch("/api/client/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online: next }),
    });
    refreshRoster();
  }

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;
  const canReply = !!selected && selected.assignedAgentId === accountId;

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/client/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedId, message: reply }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.error ?? "Couldn't send reply.");
        return;
      }
      setReply("");
      fetch(`/api/client/inbox/messages?sessionId=${encodeURIComponent(selectedId)}`)
        .then((r) => r.json())
        .then((d: { messages: Message[] }) => setMessages(d.messages ?? []));
      refreshInbox();
    } finally {
      setSending(false);
    }
  }

  async function markResolved() {
    if (!selectedId) return;
    await fetch("/api/client/inbox/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: selectedId, status: "bot" }),
    });
    refreshInbox();
  }

  return (
    <DashboardShell
      sidebarLabel={
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--accent)", textTransform: "uppercase" }}>AIVA</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Agent Console</div>
        </div>
      }
      groups={NAV_GROUPS}
      activeTab={tab}
      onSelect={setTab}
      username={username}
      onLogout={onLogout}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
        <button
          onClick={togglePresence}
          style={{
            ...primaryButtonStyle,
            background: online ? "var(--success)" : "var(--surface)",
            color: online ? "#08111f" : "var(--text)",
            border: online ? "none" : "1px solid var(--border)",
          }}
        >
          {online ? "● Online" : "○ Offline"}
        </button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {agents.map((a) => (
            <span key={a.id} style={badgeStyle(a.online ? "ok" : "neutral")}>
              {a.online ? "●" : "○"} {a.username}
              {a.id === accountId ? " (you)" : ""}
            </span>
          ))}
          {agents.length === 0 && <span style={subtleTextStyle}>No teammates yet.</span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <section style={{ ...cardStyle, width: 320, flexShrink: 0, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600 }}>
            {tab === "team" ? "Every chat in this business" : "Chats assigned to you"}
          </div>
          {!conversations && <p style={{ padding: 16 }}>Loading…</p>}
          {conversations?.length === 0 && <p style={{ padding: 16, ...subtleTextStyle }}>Nothing here right now.</p>}
          {conversations?.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="plain"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 16px",
                borderBottom: "1px solid var(--border)",
                background: selectedId === c.id ? "var(--accent-soft)" : "transparent",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.customerName ?? c.id.slice(0, 10)}</div>
              <div style={{ fontSize: 12, color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.lastMessage ?? ""}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <span style={badgeStyle(c.handoffStatus === "human" ? "ok" : "warn")}>{c.handoffStatus}</span>
                {tab === "team" && (
                  <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                    {c.assignedAgentId
                      ? agents.find((a) => a.id === c.assignedAgentId)?.username ?? "assigned"
                      : "unassigned"}
                  </span>
                )}
              </div>
            </button>
          ))}
        </section>

        <section style={{ ...cardStyle, flex: 1, minWidth: 0 }}>
          {!selected && <p style={subtleTextStyle}>Select a chat to view it.</p>}
          {selected && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>{selected.customerName ?? selected.id.slice(0, 10)}</h3>
                {canReply && (
                  <button onClick={markResolved} style={{ fontSize: 12 }}>
                    Mark resolved
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto", marginBottom: 12 }}>
                {messages?.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.role === "user" ? "flex-start" : "flex-end",
                      maxWidth: "75%",
                      padding: "8px 12px",
                      borderRadius: 10,
                      background: m.role === "user" ? "var(--surface)" : "var(--accent-soft)",
                      fontSize: 13,
                    }}
                  >
                    {m.content}
                  </div>
                ))}
              </div>
              {canReply ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ flex: 1, padding: 8 }}
                    placeholder="Type a reply…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendReply();
                    }}
                  />
                  <button onClick={sendReply} disabled={sending || !reply.trim()} style={primaryButtonStyle}>
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              ) : (
                <p style={subtleTextStyle}>
                  {selected.assignedAgentId
                    ? "Assigned to a teammate — view only."
                    : "Not assigned to an agent yet — view only."}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
