"use client";

import { useEffect, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, badgeStyle, primaryButtonStyle } from "./dashboard-styles";

interface Agent {
  id: string;
  username: string;
  online: boolean;
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Business owner's self-service handoff-team management -- create up
 * to the limit the platform admin set (Business.maxAgents), see who's
 * online, remove one. The actual chat inbox those agents work from is
 * AgentConsole.tsx, a completely separate scoped dashboard their own
 * login lands on; this panel only manages the accounts. */
export function AgentsPanel() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [limit, setLimit] = useState<{ max: number; used: number } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    fetch("/api/client/agents")
      .then((r) => r.json())
      .then((d: { agents: Agent[]; limit: { max: number; used: number } }) => {
        setAgents(d.agents ?? []);
        setLimit(d.limit ?? null);
      });
  }

  useEffect(refresh, []);

  async function createAgent() {
    if (!username.trim() || !password) return;
    setCreating(true);
    setMessage("");
    try {
      const res = await fetch("/api/client/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${result.error}`);
        return;
      }
      setMessage(`Login created for "${username}" -- share these credentials with your teammate now, the password won't be shown again.`);
      setUsername("");
      setPassword("");
      setShowPassword(false);
      refresh();
    } finally {
      setCreating(false);
    }
  }

  async function removeAgent(agent: Agent) {
    const confirmed = window.confirm(`Remove "${agent.username}"? They'll lose access immediately.`);
    if (!confirmed) return;
    setBusyId(agent.id);
    try {
      await fetch(`/api/client/agents?id=${encodeURIComponent(agent.id)}`, { method: "DELETE" });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  const atLimit = limit ? limit.used >= limit.max : false;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Agents</h2>
      <p style={subtleTextStyle}>
        Create logins for your handoff team -- each agent gets their own scoped console: an online/offline toggle,
        their own assigned chats, and read-only visibility into teammates&apos; chats. New handoffs auto-assign to
        whichever online agent currently has the fewest open chats.
      </p>

      {limit && (
        <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 4 }}>
          {limit.used}/{limit.max} agents used
          {limit.max === 0 && " -- ask the platform to enable this for your account."}
        </p>
      )}

      {message && <p style={{ fontSize: 13, opacity: 0.85, marginTop: 8 }}>{message}</p>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <input
          style={{ padding: 8, minWidth: 160 }}
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={atLimit}
        />
        <input
          style={{ padding: 8, minWidth: 180 }}
          placeholder="Password (min 8 chars)"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={atLimit}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
          Show
        </label>
        <button onClick={createAgent} disabled={creating || atLimit} style={primaryButtonStyle}>
          {creating ? "Creating…" : "+ Add agent"}
        </button>
      </div>

      {!agents && <p style={{ marginTop: 16 }}>Loading…</p>}

      {agents && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
            <thead>
              <tr>
                <th style={cellStyle}>Username</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Last login</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id}>
                  <td style={cellStyle}>{a.username}</td>
                  <td style={cellStyle}>
                    <span style={badgeStyle(a.online ? "ok" : "neutral")}>{a.online ? "Online" : "Offline"}</span>
                  </td>
                  <td style={cellStyle}>{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "Never"}</td>
                  <td style={cellStyle}>
                    <button onClick={() => removeAgent(a)} disabled={busyId === a.id}>
                      {busyId === a.id ? "…" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr>
                  <td style={cellStyle} colSpan={4}>
                    No agents yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
