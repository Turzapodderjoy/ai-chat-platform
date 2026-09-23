"use client";

import { Fragment, useEffect, useState } from "react";

import { AllChatsPanel } from "../../components/AllChatsPanel";
import { PlatformChannelAppsPanel } from "../../components/PlatformChannelAppsPanel";
import { TagsPanel } from "../../components/TagsPanel";
import { ClientAccessPanel } from "../../components/ClientAccessPanel";
import { AdminUsersPanel } from "../../components/AdminUsersPanel";
import { OverviewPanel } from "../../components/OverviewPanel";
import { ContactsPanel } from "../../components/ContactsPanel";
import { InvoicesPanel } from "../../components/InvoicesPanel";
import { SubscriptionPanel } from "../../components/SubscriptionPanel";
import { StatusBadge } from "../../components/StatusBadge";
import { DashboardShell, type NavGroup } from "../../components/DashboardShell";
import { cardStyle, cellStyle, subtleTextStyle, primaryButtonStyle, inputStyle } from "../../components/dashboard-styles";
import { showAlert, showConfirm } from "../../lib/app-dialog";
import { StatCard, StatCardRow } from "../../components/StatCard";
import { HermesAgentsPanel } from "../../components/HermesAgentsPanel";

// The full IANA zone list, straight from the runtime -- every browser
// and Node 18+ ships this, so there's no reason to hand-curate a
// shorter list and risk missing one a client actually needs.
const TIMEZONE_OPTIONS: string[] =
  typeof Intl !== "undefined" && "supportedValuesOf" in Intl
    ? (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf("timeZone")
    : ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "UTC"];

// GMT offset only, per request -- no zone/city name in the visible label
// (the IANA id is still the option's value underneath, so selection and
// the actual saved timezone are unaffected).
function gmtOffsetMinutes(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date());
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = raw.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

function gmtOffsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT ${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

// Hundreds of IANA zones collapse onto only ~35 distinct current offsets --
// dozens of "GMT -6" entries with nothing to tell them apart was worse than
// the plain zone list it replaced. One dropdown entry per distinct offset,
// each still saving a real IANA id (the first zone found at that offset)
// so the underlying interpretation stays correct.
const TIMEZONE_LABELS: [string, string][] = (() => {
  const seen = new Map<number, string>();
  for (const tz of TIMEZONE_OPTIONS) {
    const minutes = gmtOffsetMinutes(tz);
    if (!seen.has(minutes)) seen.set(minutes, tz);
  }
  return [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minutes, tz]): [string, string] => [tz, gmtOffsetLabel(minutes)]);
})();

type Tab = "overview" | "vpsHealth" | "channels" | "usage" | "clients" | "access" | "adminUsers" | "allchats" | "database" | "tags" | "contacts" | "invoices" | "subscription" | "hermesAgents";

const NAV_GROUPS: NavGroup<Tab>[] = [
  { items: [{ id: "overview", label: "Overview" }] },
  {
    label: "CRM",
    items: [
      { id: "contacts", label: "Customer Database" },
    ],
  },
  {
    label: "Revenue",
    items: [
      { id: "invoices", label: "Invoices" },
    ],
  },
  { items: [{ id: "clients", label: "Clients" }, { id: "access", label: "Client Access" }, { id: "adminUsers", label: "Admin Users" }, { id: "subscription", label: "Subscription" }] },
  {
    label: "Conversations",
    items: [
      { id: "allchats", label: "Inbox" },
      { id: "tags", label: "Tags" },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "channels", label: "Integrations" },
      { id: "usage", label: "Usage" },
      { id: "database", label: "Database" },
      { id: "hermesAgents", label: "Hermes Agents" },
      { id: "vpsHealth", label: "VPS Health" },
    ],
  },
];

interface ChatUsageEntry {
  chatId: string;
  provider: string;
  tokens: number;
  confidence: number;
  createdAt: string;
}

interface DatabaseStatus {
  connected: boolean;
  host: string | null;
  error?: string;
}

interface Client {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  maxAgents: number;
  type: string;
  enabledIntegrations: string[] | null;
  timezone: string;
}

const TAB_IDS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));

export default function DashboardClient() {
  const [tab, setTab] = useState<Tab>("overview");
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUsername(typeof data.username === "string" ? data.username : null));
  }, []);

  // Always renders "overview" on the server/first paint to avoid a
  // hydration mismatch, then jumps to whatever tab a refresh's own URL
  // still carries once mounted.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (requested && TAB_IDS.includes(requested)) {
      setTab(requested);
    }
  }, []);

  // Keeps the URL's ?tab= in sync with clicks so a refresh lands back on
  // the same panel instead of resetting to Overview -- replaceState, not
  // router.push, so switching tabs never grows browser history.
  function selectTab(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  function logout() {
    fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.assign("/"));
  }

  return (
    <DashboardShell
      sidebarLabel={
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>AIVA</div>
          <div style={{ fontSize: 10.5, color: "var(--text-faint)", fontWeight: 400, marginTop: 2 }}>
            Agent Platform
          </div>
        </div>
      }
      groups={NAV_GROUPS}
      activeTab={tab}
      onSelect={selectTab}
      username={username}
      onLogout={logout}
      fillHeight={tab === "allchats"}
    >
      {/* Every panel stays mounted (hidden via CSS, not unmounted) so
          switching tabs never wipes a panel's local state. */}
      <div style={{ display: tab === "overview" ? "block" : "none" }}>
        <OverviewPanel active={tab === "overview"} />
      </div>
      <div style={{ display: tab === "channels" ? "block" : "none" }}>
        <PlatformChannelAppsPanel />
      </div>
      <div style={{ display: tab === "usage" ? "block" : "none" }}>
        <UsagePanel />
      </div>
      <div style={{ display: tab === "clients" ? "block" : "none" }}>
        <ClientsPanel />
      </div>
      <div style={{ display: tab === "access" ? "block" : "none" }}>
        <ClientAccessPanel />
      </div>
      <div style={{ display: tab === "adminUsers" ? "block" : "none" }}>
        <AdminUsersPanel />
      </div>
      <div style={{ display: tab === "subscription" ? "block" : "none" }}>
        <SubscriptionPanel />
      </div>
      <div style={{ display: tab === "allchats" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <AllChatsPanel active={tab === "allchats"} />
      </div>
      <div style={{ display: tab === "contacts" ? "block" : "none" }}>
        <ContactsPanel active={tab === "contacts"} />
      </div>
      <div style={{ display: tab === "invoices" ? "block" : "none" }}>
        <InvoicesPanel active={tab === "invoices"} />
      </div>
      <div style={{ display: tab === "tags" ? "block" : "none" }}>
        <TagsPanel />
      </div>
      <div style={{ display: tab === "database" ? "block" : "none" }}>
        <DatabasePanel />
      </div>
      <div style={{ display: tab === "vpsHealth" ? "block" : "none" }}>
        <VpsHealthPanel active={tab === "vpsHealth"} />
      </div>
      <div style={{ display: tab === "hermesAgents" ? "block" : "none" }}>
        <HermesAgentsPanel />
      </div>
    </DashboardShell>
  );
}

function ClientsPanel() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("regular");
  const [creating, setCreating] = useState(false);

  const [notifyOpenId, setNotifyOpenId] = useState<string | null>(null);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [sendingNotify, setSendingNotify] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState("");

  const [integrationsOpenId, setIntegrationsOpenId] = useState<string | null>(null);

  // Every real login for every client, so "Client view" can jump straight
  // into a SPECIFIC login's exact view (their own allowedPanels) instead
  // of guessing at the first one -- avoids burning one of that login's
  // limited device slots just to check what they see.
  interface ClientLogin {
    id: string;
    businessId: string | null;
    username: string;
    role: string | null;
    isAdmin: boolean;
  }
  const [accounts, setAccounts] = useState<ClientLogin[]>([]);
  const [viewAsOpenId, setViewAsOpenId] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/client-accounts")
      .then((r) => r.json())
      .then((d: { accounts: ClientLogin[] }) => setAccounts(d.accounts ?? []));
  }, []);

  const ALL_INTEGRATIONS = [
    { id: "website", label: "Website" },
    { id: "messenger", label: "Messenger" },
    { id: "instagram", label: "Instagram" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "email", label: "Email (Gmail)" },
  ];

  async function toggleIntegration(client: Client, integrationId: string) {
    const current = client.enabledIntegrations;
    let next: string[];
    if (!current) {
      // null = all enabled; start by disabling the toggled one
      next = ALL_INTEGRATIONS.map((i) => i.id).filter((id) => id !== integrationId);
    } else if (current.includes(integrationId)) {
      next = current.filter((id) => id !== integrationId);
    } else {
      next = [...current, integrationId];
    }
    // If all are selected, set to null (all enabled)
    const allSelected = ALL_INTEGRATIONS.every((i) => next.includes(i.id));
    await fetch(`/api/admin/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabledIntegrations: allSelected ? null : next }),
    });
    refresh();
  }

  async function sendNotification(client: Client) {
    if (!notifyTitle.trim()) return;
    setSendingNotify(true);
    try {
      await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: client.id, title: notifyTitle.trim(), body: notifyBody.trim() }),
      });
      setNotifyMessage(`Sent to ${client.name} — shows in their notification bell now.`);
      setNotifyTitle("");
      setNotifyBody("");
    } finally {
      setSendingNotify(false);
    }
  }

  function refresh() {
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((data) => {
        const list: Client[] = data.clients;
        setClients(list);
      });
  }

  useEffect(refresh, []);

  async function addClient() {
    if (!name.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        await showAlert(`Couldn't create "${name}": ${body?.error ?? res.statusText}`);
        return;
      }
      setName("");
      setType("regular");
      refresh();
    } catch {
      await showAlert("Network error — couldn't reach the server.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteClient(client: Client) {
    const confirmed = await showConfirm(
      `Delete "${client.name}"? This permanently removes their conversations, crawl targets, and indexed knowledge base — it cannot be undone.`
    );
    if (!confirmed) return;

    const res = await fetch(`/api/admin/clients/${client.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      await showAlert(`Couldn't delete "${client.name}": ${body?.error ?? res.statusText}`);
      return;
    }
    setClients((prev) => prev?.filter((c) => c.id !== client.id) ?? prev);
  }

  async function setMaxAgents(client: Client, maxAgents: number) {
    await fetch(`/api/admin/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxAgents }),
    });
    refresh();
  }

  async function setTimezone(client: Client, timezone: string) {
    await fetch(`/api/admin/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone }),
    });
    refresh();
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Clients</h2>
      <p style={subtleTextStyle}>
        Adding a company creates its dashboard immediately — every client
        shares the same dashboard page (/dashboard/[id]), so there&apos;s
        nothing to deploy per client and every future update applies to all
        of them at once.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          style={{ ...inputStyle, flex: "1 1 200px", minWidth: 0 }}
          placeholder="Company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addClient();
          }}
        />
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inputStyle, width: "auto", flex: "0 0 auto" }}>
          <option value="regular">Regular</option>
          <option value="repair">Repair</option>
        </select>
        <button onClick={addClient} disabled={creating} style={primaryButtonStyle}>
          {creating ? "Adding…" : "Add company"}
        </button>
      </div>

      {!clients && <p>Loading…</p>}

      {clients && (
        <div className="table-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, minWidth: 700 }}>
          <thead>
            <tr>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Type</th>
              <th style={cellStyle}>Created</th>
              <th style={cellStyle}>Max agents</th>
              <th style={cellStyle}>Timezone</th>
              <th style={cellStyle}>Integrations</th>
              <th style={cellStyle}>Dashboard</th>
              <th style={cellStyle}>Notify</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <Fragment key={c.id}>
              <tr>
                <td style={cellStyle}>{c.name}</td>
                <td style={cellStyle}>
                  <span style={{ textTransform: "capitalize" }}>{c.type}</span>
                </td>
                <td style={cellStyle}>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td style={cellStyle}>
                  <input
                    type="number"
                    min={0}
                    defaultValue={c.maxAgents}
                    style={{ width: 72, padding: "6px 8px" }}
                    onBlur={(e) => {
                      const next = Math.max(0, Number(e.target.value) || 0);
                      if (next !== c.maxAgents) setMaxAgents(c, next);
                    }}
                    title="How many handoff-team agent logins this client can create for themselves"
                  />
                </td>
                <td style={cellStyle}>
                  <select
                    defaultValue={c.timezone}
                    onChange={(e) => setTimezone(c, e.target.value)}
                    style={{ padding: "6px 8px", maxWidth: 220 }}
                    title="Timezone this client's AI-booked repair appointments are interpreted in"
                  >
                    {/* The client's saved zone might not be the one
                        TIMEZONE_LABELS kept as the representative for its
                        offset -- inject it so this never silently shows
                        the wrong selection for a zone actually in use. */}
                    {!TIMEZONE_LABELS.some(([tz]) => tz === c.timezone) && (
                      <option value={c.timezone}>{gmtOffsetLabel(gmtOffsetMinutes(c.timezone))}</option>
                    )}
                    {TIMEZONE_LABELS.map(([tz, label]) => (
                      <option key={tz} value={tz}>{label}</option>
                    ))}
                  </select>
                </td>
                <td style={cellStyle}>
                  <button
                    onClick={() => setIntegrationsOpenId(integrationsOpenId === c.id ? null : c.id)}
                    style={{ fontSize: 12 }}
                  >
                    {integrationsOpenId === c.id ? "Close" : "Configure"}
                  </button>
                </td>
                <td style={cellStyle}>
                  <a href={`/dashboard/${c.id}`}>Admin view</a>
                  {" · "}
                  <button
                    className="plain"
                    onClick={() => setViewAsOpenId(viewAsOpenId === c.id ? null : c.id)}
                    style={{ fontSize: "inherit", color: "var(--accent)", textDecoration: "underline", cursor: "pointer" }}
                    title="Open exactly as one of this client's own logins sees it -- no sign-in, doesn't touch their device limit"
                  >
                    View as…
                  </button>
                </td>
                <td style={cellStyle}>
                  <button
                    onClick={() => {
                      setNotifyOpenId(notifyOpenId === c.id ? null : c.id);
                      setNotifyMessage("");
                    }}
                    style={{ fontSize: 12 }}
                  >
                    {notifyOpenId === c.id ? "Close" : "Notify"}
                  </button>
                </td>
                <td style={cellStyle}>
                  <button onClick={() => deleteClient(c)}>Delete</button>
                </td>
              </tr>
              {viewAsOpenId === c.id && (
                <tr>
                  <td style={{ ...cellStyle, background: "var(--surface)" }} colSpan={9}>
                    {(() => {
                      const logins = accounts.filter((a) => a.businessId === c.id && !a.isAdmin);
                      if (logins.length === 0) {
                        return <p style={subtleTextStyle}>No logins yet for this client — create one in Client Access.</p>;
                      }
                      return (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {logins.map((a) => (
                            <a
                              key={a.id}
                              href={`/dashboard/${c.id}?view=client&accountId=${encodeURIComponent(a.id)}`}
                              style={{ fontSize: 12, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)" }}
                            >
                              {a.username} {a.role ? `(${a.role})` : ""}
                            </a>
                          ))}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              )}
              {notifyOpenId === c.id && (
                <tr>
                  <td style={{ ...cellStyle, background: "var(--surface)" }} colSpan={9}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        placeholder="Title"
                        value={notifyTitle}
                        onChange={(e) => setNotifyTitle(e.target.value)}
                        style={{ padding: 8, flex: "1 1 150px", minWidth: 0 }}
                      />
                      <input
                        placeholder="Message (optional)"
                        value={notifyBody}
                        onChange={(e) => setNotifyBody(e.target.value)}
                        style={{ padding: 8, flex: "1 1 180px", minWidth: 0 }}
                      />
                      <button onClick={() => sendNotification(c)} disabled={sendingNotify || !notifyTitle.trim()} style={primaryButtonStyle}>
                        {sendingNotify ? "Sending…" : `Send to ${c.name}`}
                      </button>
                    </div>
                    {notifyMessage && <p style={{ ...subtleTextStyle, marginBottom: 0 }}>{notifyMessage}</p>}
                  </td>
                </tr>
              )}
              {integrationsOpenId === c.id && (
                <tr>
                  <td style={{ ...cellStyle, background: "var(--surface)" }} colSpan={9}>
                    <div style={{ fontSize: 12, marginBottom: 6, fontWeight: 600 }}>Enabled integrations for {c.name}:</div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {ALL_INTEGRATIONS.map((intg) => {
                        const enabled = !c.enabledIntegrations || c.enabledIntegrations.includes(intg.id);
                        return (
                          <label key={intg.id} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => toggleIntegration(c, intg.id)}
                              style={{ cursor: "pointer" }}
                            />
                            {intg.label}
                          </label>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                      {c.enabledIntegrations ? `${c.enabledIntegrations.length} of ${ALL_INTEGRATIONS.length} enabled` : "All integrations enabled"}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {clients.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={9}>
                  No clients yet — add one above.
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

function UsagePanel() {
  const [chats, setChats] = useState<ChatUsageEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/chat-usage")
      .then((r) => r.json())
      .then((data) => setChats(data.chats));
  }, []);

  return (
    <section>
      <h1 style={{ marginBottom: 4 }}>Usage</h1>
      <p style={subtleTextStyle}>
        In-memory ring buffer, reset on server restart — the last 200 chat
        turns recorded by the engine. The durable record lives in the
        conversation and message tables.
      </p>

      <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>By chat</h3>
      {!chats && <p>Loading…</p>}
      {chats && (
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle}>Chat ID</th>
              <th style={cellStyle}>Provider</th>
              <th style={cellStyle}>Confidence</th>
              <th style={cellStyle}>Tokens</th>
              <th style={cellStyle}>When</th>
            </tr>
          </thead>
          <tbody>
            {chats.map((c, i) => (
              <tr key={i}>
                <td style={cellStyle}>
                  <code style={{ fontSize: 11 }}>{c.chatId}</code>
                </td>
                <td style={cellStyle}>{c.provider}</td>
                <td style={cellStyle}>{Math.round(c.confidence * 100)}%</td>
                <td style={cellStyle}>{c.tokens}</td>
                <td style={cellStyle}>{new Date(c.createdAt).toLocaleTimeString()}</td>
              </tr>
            ))}
            {chats.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={5}>
                  No chats yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
      </div>
    </section>
  );
}
function DatabasePanel() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);

  useEffect(() => {
    fetch("/api/admin/database")
      .then((r) => r.json())
      .then(setStatus);
  }, []);

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Database</h2>
      <p style={subtleTextStyle}>
        Swap <code>DATABASE_URL</code> in your env (local Postgres today, any
        online Postgres — Neon, Supabase, RDS — tomorrow) and this panel
        reflects it. No connection strings are entered or stored through this
        UI.
      </p>

      {!status && <p>Loading…</p>}

      {status && (
        <ul>
          <li>Status: <StatusBadge tone={status.connected ? "ok" : "error"}>{status.connected ? "Connected" : "Not connected"}</StatusBadge></li>
          <li>Host: {status.host ?? "not set"}</li>
          {status.error && <li>Error: {status.error}</li>}
        </ul>
      )}
    </section>
  );
}

interface SystemStats {
  cpuCount: number;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
  totalMem: number;
  freeMem: number;
  usedMem: number;
  disk: { total: number; free: number; used: number } | null;
  uptimeSeconds: number;
}

function formatBytesGb(n: number): string {
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

/** Raw OS stats for whichever machine this Next.js process runs on --
 * meaningless when viewed from a local dev server, only useful against
 * the real VPS. Polls every 2 minutes -- these numbers don't need to
 * be any fresher than that. */
function VpsHealthPanel({ active }: { active: boolean }) {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    if (!active) return;
    function poll() {
      fetch("/api/admin/system-health")
        .then((r) => r.json())
        .then(setStats)
        .catch(() => {});
    }
    poll();
    const interval = setInterval(poll, 120000);
    return () => clearInterval(interval);
  }, [active]);

  const memPct = stats ? Math.round((stats.usedMem / stats.totalMem) * 100) : null;
  const diskPct = stats?.disk ? Math.round((stats.disk.used / stats.disk.total) * 100) : null;
  const loadPct = stats ? Math.round((stats.loadAvg1 / stats.cpuCount) * 100) : null;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>VPS Health</h2>
      <p style={subtleTextStyle}>
        Live CPU, memory, and storage for the production server, refreshed every 2 minutes.
      </p>

      {!stats && <p>Loading…</p>}

      {stats && (
        <>
          <StatCardRow>
            <StatCard
              label={`CPU load (${stats.cpuCount} cores)`}
              value={`${loadPct}%`}
              tone={loadPct! > 85 ? "warning" : "info"}
            />
            <StatCard
              label="Memory used"
              value={`${formatBytesGb(stats.usedMem)} / ${formatBytesGb(stats.totalMem)}`}
              tone={memPct! > 85 ? "warning" : "success"}
            />
            <StatCard
              label="Disk used"
              value={stats.disk ? `${formatBytesGb(stats.disk.used)} / ${formatBytesGb(stats.disk.total)}` : "—"}
              tone={diskPct != null && diskPct > 85 ? "warning" : "success"}
            />
          </StatCardRow>
          <p style={{ ...subtleTextStyle, marginTop: 14 }}>
            Load average (1/5/15 min): {stats.loadAvg1.toFixed(2)} / {stats.loadAvg5.toFixed(2)} / {stats.loadAvg15.toFixed(2)}
            {" · "}Uptime: {formatUptime(stats.uptimeSeconds)}
          </p>
        </>
      )}
    </section>
  );
}
