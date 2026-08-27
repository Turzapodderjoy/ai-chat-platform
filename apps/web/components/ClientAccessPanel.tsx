"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, badgeStyle, primaryButtonStyle } from "./dashboard-styles";
import { Collapsible } from "./Collapsible";

interface Client {
  id: string;
  name: string;
}

interface ClientAccount {
  id: string;
  businessId: string | null;
  businessName: string | null;
  username: string;
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  allowedPanels: string[] | null;
  isAdmin: boolean;
}

// Kept in sync by hand with the client dashboard's own NAV_GROUPS
// ([businessId]/page.tsx) -- a shared constants module felt like
// premature abstraction for one list neither side changes often, and
// a mismatch here only means a newly-added client tab shows up
// unrestricted until this list is updated, not a security hole (the
// dashboard's own filter only ever narrows, never grants access to an
// id it doesn't already render).
const ALL_PANELS: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tagdashboard", label: "Dashboard" },
  { id: "knowledge", label: "Knowledge Hub" },
  { id: "products", label: "Product Catalog" },
  { id: "orders", label: "Orders" },
  { id: "delivery", label: "Delivery" },
  { id: "repairs", label: "Repairs" },
  { id: "allchats", label: "All Chats" },
  { id: "storage", label: "Storage" },
  { id: "brain", label: "AI Brain" },
  { id: "parameters", label: "Parameters" },
  { id: "arena", label: "Training Arena" },
  { id: "review", label: "Chat Learning" },
  { id: "channels", label: "Integrations" },
  { id: "contacts", label: "Contacts" },
  { id: "companies", label: "Companies" },
  { id: "deals", label: "Deals" },
  { id: "quotes", label: "Quotes" },
  { id: "invoices", label: "Invoices" },
  { id: "reports", label: "Reports" },
];

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

function generatePassword(length = 14): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => PASSWORD_CHARS[n % PASSWORD_CHARS.length]).join("");
}

/** Mother dashboard's login-credential management for client accounts —
 * the login page at "/" checks these for real, and a valid session
 * lands only on that account's own /dashboard/{businessId} (see
 * middleware.ts). The mother dashboard itself stays open by design
 * (CLAUDE.md); this panel is what closes that gap for the dashboards
 * handed out to clients. */
export function ClientAccessPanel() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [accounts, setAccounts] = useState<ClientAccount[] | null>(null);

  const [businessId, setBusinessId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingPanels, setPendingPanels] = useState<Record<string, string[]>>({});

  function refresh() {
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((data) => setClients(data.clients));

    fetch("/api/admin/client-accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts));
  }

  useEffect(refresh, []);

  useEffect(() => {
    if (!businessId && clients && clients.length > 0) {
      setBusinessId(clients[0]!.id);
    }
  }, [clients, businessId]);

  async function createAccount() {
    if ((!isAdmin && !businessId) || !username.trim() || !password) return;
    setCreating(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/client-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: isAdmin ? undefined : businessId, username, password, isAdmin }),
      });
      const result = await res.json();

      if (!res.ok) {
        setMessage(`Error: ${result.error}`);
        return;
      }

      setMessage(`Login created for "${username}". Share these credentials with the ${isAdmin ? "new admin" : "client"} now — the password won't be shown again.`);
      setUsername("");
      setPassword("");
      setShowPassword(false);
      setIsAdmin(false);
      refresh();
    } finally {
      setCreating(false);
    }
  }

  async function setDisabled(account: ClientAccount, disabled: boolean) {
    setBusyId(account.id);
    try {
      await fetch("/api/admin/client-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, disabled }),
      });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  function togglePanelsBox(account: ClientAccount) {
    if (expandedId === account.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(account.id);
    setPendingPanels((prev) => ({
      ...prev,
      [account.id]: prev[account.id] ?? account.allowedPanels ?? ALL_PANELS.map((p) => p.id),
    }));
  }

  function togglePanel(accountId: string, panelId: string) {
    setPendingPanels((prev) => {
      const current = prev[accountId] ?? [];
      const next = current.includes(panelId) ? current.filter((p) => p !== panelId) : [...current, panelId];
      return { ...prev, [accountId]: next };
    });
  }

  async function savePanels(account: ClientAccount) {
    const selected = pendingPanels[account.id] ?? [];
    setBusyId(account.id);
    try {
      // Selecting every panel is the same as no restriction at all —
      // save null so a future new tab isn't silently hidden from an
      // account that was really meant to see everything.
      const allowedPanels = selected.length === ALL_PANELS.length ? null : selected;
      await fetch("/api/admin/client-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, allowedPanels }),
      });
      setExpandedId(null);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAccount(account: ClientAccount) {
    const confirmed = window.confirm(
      `Delete the login "${account.username}"? They'll lose access to ${account.businessName} immediately — this cannot be undone.`
    );
    if (!confirmed) return;

    setBusyId(account.id);
    try {
      await fetch(`/api/admin/client-accounts?id=${encodeURIComponent(account.id)}`, { method: "DELETE" });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  const filteredAccounts = useMemo(() => {
    if (!accounts) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.username.toLowerCase().includes(q) || (a.businessName?.toLowerCase().includes(q) ?? false)
    );
  }, [accounts, filter]);

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Client Access</h2>
      <p style={subtleTextStyle}>
        Create a login for a client — they sign in at the main site and land straight on their own dashboard
        (/dashboard/&#123;id&#125;), nowhere else. A client can have more than one login (e.g. different staff).
        Disabling a login kicks out any session they&apos;re already in, immediately.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
        <select
          style={{ padding: 8 }}
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          disabled={isAdmin}
        >
          {!clients && <option>Loading…</option>}
          {clients?.length === 0 && <option>No clients yet</option>}
          {clients?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          style={{ padding: 8, minWidth: 160 }}
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          style={{ padding: 8, minWidth: 180 }}
          placeholder="Password (min 8 chars)"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="button" onClick={() => setPassword(generatePassword())}>
          Generate
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
          Show
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }} title="Full platform access, same as the admin/admin login — not scoped to one client.">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          Admin (full access)
        </label>
        <button onClick={createAccount} disabled={creating || (!isAdmin && !clients?.length)} style={primaryButtonStyle}>
          {creating ? "Creating…" : "+ Create login"}
        </button>
      </div>

      {message && <p style={{ fontSize: 13, opacity: 0.85, marginTop: 8 }}>{message}</p>}

      <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>All logins</h3>
        <input
          style={{ padding: 6, fontSize: 13, width: 200 }}
          placeholder="Filter by username or client…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {!filteredAccounts && <p>Loading…</p>}

      {filteredAccounts && (
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <th style={cellStyle}>Username</th>
              <th style={cellStyle}>Client</th>
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}>Panels</th>
              <th style={cellStyle}>Last login</th>
              <th style={cellStyle}>Created</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.map((a) => {
              const panelCount = a.allowedPanels?.length ?? ALL_PANELS.length;
              const restricted = a.allowedPanels !== null;
              const selected = pendingPanels[a.id] ?? a.allowedPanels ?? ALL_PANELS.map((p) => p.id);

              return (
                <Fragment key={a.id}>
                  <tr>
                    <td style={cellStyle}>{a.username}</td>
                    <td style={cellStyle}>
                      {a.isAdmin ? <span style={badgeStyle("info")}>Admin — all clients</span> : a.businessName}
                    </td>
                    <td style={cellStyle}>
                      <span style={badgeStyle(a.disabled ? "error" : "ok")}>{a.disabled ? "Restricted" : "Active"}</span>
                    </td>
                    <td style={cellStyle}>
                      {a.isAdmin ? (
                        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>All panels</span>
                      ) : (
                        <button onClick={() => togglePanelsBox(a)} className="plain" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {restricted ? `${panelCount}/${ALL_PANELS.length} panels` : "All panels"}
                        </button>
                      )}
                    </td>
                    <td style={cellStyle}>{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "Never"}</td>
                    <td style={cellStyle}>{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td style={cellStyle}>
                      <button onClick={() => setDisabled(a, !a.disabled)} disabled={busyId === a.id}>
                        {busyId === a.id ? "…" : a.disabled ? "Re-enable" : "Restrict"}
                      </button>{" "}
                      <button onClick={() => deleteAccount(a)} disabled={busyId === a.id}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expandedId === a.id && (
                    <tr>
                      <td style={{ ...cellStyle, borderTop: "none" }} colSpan={6}>
                        <Collapsible title={`Which panels can "${a.username}" see?`} defaultOpen>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                            {ALL_PANELS.map((p) => (
                              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                                <input
                                  type="checkbox"
                                  checked={selected.includes(p.id)}
                                  onChange={() => togglePanel(a.id, p.id)}
                                />
                                {p.label}
                              </label>
                            ))}
                          </div>
                          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                            <button onClick={() => savePanels(a)} disabled={busyId === a.id} style={primaryButtonStyle}>
                              {busyId === a.id ? "Saving…" : "Save"}
                            </button>
                            <button onClick={() => setExpandedId(null)}>Cancel</button>
                          </div>
                        </Collapsible>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filteredAccounts.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={7}>
                  {accounts?.length === 0 ? "No logins yet — create one above." : "No logins match that filter."}
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
