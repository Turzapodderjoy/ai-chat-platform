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
  teamId: string | null;
  role: string | null;
}

interface Team {
  id: string;
  businessId: string;
  name: string;
  parentTeamId: string | null;
  defaultAllowedPanels: string[] | null;
  memberCount: number;
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
  { id: "inventory", label: "Inventory" },
  { id: "notifications", label: "Notifications" },
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
  { id: "quotes", label: "Quotes" },
  { id: "invoices", label: "Invoices" },
  { id: "reports", label: "Reports" },
];

interface ActivityEntry {
  action: string;
  detail: string | null;
  changedBy: string;
  changedAt: string;
}

const PANEL_LABEL = new Map(ALL_PANELS.map((p) => [p.id, p.label]));
const panelLabels = (ids: string[]) => ids.map((id) => PANEL_LABEL.get(id) ?? id).join(", ");

function describeActivity(entry: ActivityEntry): string {
  if (entry.action === "password") return "Password reset";
  if (entry.action === "disabled") return "Login restricted";
  if (entry.action === "enabled") return "Login re-enabled";

  if (entry.action === "panels") {
    try {
      const { added, removed } = JSON.parse(entry.detail ?? "{}") as { added: string[]; removed: string[] };
      const parts: string[] = [];
      if (added?.length) parts.push(`added ${panelLabels(added)}`);
      if (removed?.length) parts.push(`removed ${panelLabels(removed)}`);
      return parts.length ? `Panels changed — ${parts.join("; ")}` : "Panels saved (no actual change)";
    } catch {
      return "Panels changed";
    }
  }

  return entry.action;
}

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
  const [newRole, setNewRole] = useState<"admin" | "owner" | "staff">("owner");
  const isAdmin = newRole === "admin";
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingPanels, setPendingPanels] = useState<Record<string, string[]>>({});

  // Password reset -- there's no "view" for an existing password
  // (hashed, one-way), only change-and-log-it. pwExpandedId mirrors
  // expandedId's pattern but is a separate toggle since a row can open
  // either box independently. The box also shows the account's FULL
  // activity trail (password resets, panel changes, restrict/enable),
  // not just password resets -- see AccountActivityLog.
  const [pwExpandedId, setPwExpandedId] = useState<string | null>(null);
  const [pwDraft, setPwDraft] = useState<Record<string, string>>({});
  const [pwShow, setPwShow] = useState<Record<string, boolean>>({});
  const [activity, setActivity] = useState<Record<string, ActivityEntry[]>>({});
  const [pwMessage, setPwMessage] = useState("");

  function refreshActivity(accountId: string) {
    fetch(`/api/admin/client-accounts/activity?id=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((d: { history: ActivityEntry[] }) => setActivity((prev) => ({ ...prev, [accountId]: d.history ?? [] })));
  }

  // Teams -- RBAC hierarchy layer (Day 1 AM). Scoped to whichever
  // business the create-login form currently targets, same businessId
  // state the rest of this panel already uses -- no separate picker.
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamMessage, setTeamMessage] = useState("");
  const [teamPanelsExpandedId, setTeamPanelsExpandedId] = useState<string | null>(null);
  const [pendingTeamPanels, setPendingTeamPanels] = useState<Record<string, string[]>>({});

  function refreshTeams(forBusinessId: string) {
    if (!forBusinessId) return;
    fetch(`/api/admin/teams?businessId=${encodeURIComponent(forBusinessId)}`)
      .then((r) => r.json())
      .then((d: { teams: Team[] }) => setTeams(d.teams ?? []));
  }

  useEffect(() => {
    if (businessId) refreshTeams(businessId);
  }, [businessId]);

  async function createTeam() {
    if (!newTeamName.trim() || !businessId) return;
    setCreatingTeam(true);
    setTeamMessage("");
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, name: newTeamName }),
      });
      const result = await res.json();
      if (!res.ok) {
        setTeamMessage(`Error: ${result.error}`);
        return;
      }
      setNewTeamName("");
      refreshTeams(businessId);
    } finally {
      setCreatingTeam(false);
    }
  }

  async function deleteTeam(team: Team) {
    if (!window.confirm(`Delete team "${team.name}"? Members keep their own login, just lose this team's default panel access.`)) return;
    await fetch(`/api/admin/teams?id=${encodeURIComponent(team.id)}`, { method: "DELETE" });
    refreshTeams(businessId);
  }

  function toggleTeamPanelsBox(team: Team) {
    if (teamPanelsExpandedId === team.id) {
      setTeamPanelsExpandedId(null);
      return;
    }
    setTeamPanelsExpandedId(team.id);
    setPendingTeamPanels((prev) => ({
      ...prev,
      [team.id]: prev[team.id] ?? team.defaultAllowedPanels ?? ALL_PANELS.map((p) => p.id),
    }));
  }

  async function saveTeamPanels(team: Team) {
    const selected = pendingTeamPanels[team.id] ?? [];
    const defaultAllowedPanels = selected.length === ALL_PANELS.length ? null : selected;
    await fetch("/api/admin/teams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: team.id, defaultAllowedPanels }),
    });
    setTeamPanelsExpandedId(null);
    refreshTeams(businessId);
  }

  async function assignTeam(account: ClientAccount, teamId: string) {
    setBusyId(account.id);
    try {
      await fetch("/api/admin/client-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, teamId: teamId || null }),
      });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  // Role defaults ("owner"/"staff") -- per-business, one-time copied
  // into a new login's own allowedPanels when that role is picked in
  // the create-login dropdown above. See RolePreset's own schema
  // comment for why this is a snapshot, not a live link like Teams.
  const [rolePresets, setRolePresets] = useState<{ owner: string[] | null; staff: string[] | null }>({ owner: null, staff: null });
  const [presetEditingRole, setPresetEditingRole] = useState<"owner" | "staff" | null>(null);
  const [pendingPresetPanels, setPendingPresetPanels] = useState<string[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);

  function refreshRolePresets(forBusinessId: string) {
    if (!forBusinessId) return;
    fetch(`/api/admin/role-presets?businessId=${encodeURIComponent(forBusinessId)}`)
      .then((r) => r.json())
      .then((d: { owner: string[] | null; staff: string[] | null }) => setRolePresets(d));
  }

  useEffect(() => {
    if (businessId) refreshRolePresets(businessId);
  }, [businessId]);

  function togglePresetEditor(role: "owner" | "staff") {
    if (presetEditingRole === role) {
      setPresetEditingRole(null);
      return;
    }
    setPresetEditingRole(role);
    setPendingPresetPanels(rolePresets[role] ?? ALL_PANELS.map((p) => p.id));
  }

  async function saveRolePreset() {
    if (!presetEditingRole || !businessId) return;
    setSavingPreset(true);
    try {
      const allowedPanels = pendingPresetPanels.length === ALL_PANELS.length ? null : pendingPresetPanels;
      await fetch("/api/admin/role-presets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, role: presetEditingRole, allowedPanels }),
      });
      setPresetEditingRole(null);
      refreshRolePresets(businessId);
    } finally {
      setSavingPreset(false);
    }
  }

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

  function quickCreateFor(id: string) {
    setNewRole("owner");
    setBusinessId(id);
    setMessage("");
    document.getElementById("client-access-username")?.focus();
  }

  async function createAccount() {
    if ((!isAdmin && !businessId) || !username.trim() || !password) return;
    setCreating(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/client-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: isAdmin ? undefined : businessId,
          username,
          password,
          isAdmin,
          role: isAdmin ? undefined : newRole,
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        setMessage(`Error: ${result.error}`);
        return;
      }

      setMessage(`Login created for "${username}" (${newRole}). Share these credentials with the ${isAdmin ? "new admin" : "client"} now — the password won't be shown again.`);
      setUsername("");
      setPassword("");
      setShowPassword(false);
      setNewRole("owner");
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
      if (account.id in activity) refreshActivity(account.id);
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
        body: JSON.stringify({ id: account.id, allowedPanels, allPanelIds: ALL_PANELS.map((p) => p.id) }),
      });
      setExpandedId(null);
      refresh();
      if (account.id in activity) refreshActivity(account.id);
    } finally {
      setBusyId(null);
    }
  }

  function togglePasswordBox(account: ClientAccount) {
    if (pwExpandedId === account.id) {
      setPwExpandedId(null);
      return;
    }
    setPwExpandedId(account.id);
    setPwMessage("");
    if (!(account.id in activity)) refreshActivity(account.id);
  }

  async function savePassword(account: ClientAccount) {
    const next = pwDraft[account.id] ?? "";
    if (next.length < 8) {
      setPwMessage("Password must be at least 8 characters.");
      return;
    }
    setBusyId(account.id);
    try {
      const res = await fetch("/api/admin/client-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, password: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setPwMessage(`Error: ${body?.error ?? res.statusText}`);
        return;
      }
      setPwMessage(`Password changed for "${account.username}" — share it with them now, it won't be shown again. Any of their active sessions were signed out.`);
      setPwDraft((prev) => ({ ...prev, [account.id]: "" }));
      refreshActivity(account.id);
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
      // Removed from local state immediately -- don't wait on a
      // re-fetch to make the row disappear, that's what forced a
      // manual browser refresh before to see any delete reflected.
      setAccounts((prev) => prev?.filter((a) => a.id !== account.id) ?? prev);
    } finally {
      setBusyId(null);
    }
  }

  // One row per CLIENT (not per account) so a business with no login yet
  // still shows up here -- otherwise there was no way to tell "never
  // given access" apart from "just hasn't been added as a client yet".
  // A business can have more than one login, so each row carries an array.
  const clientRows = useMemo(() => {
    if (!clients || !accounts) return null;
    const q = filter.trim().toLowerCase();
    const rows = clients.map((c) => ({
      client: c,
      accounts: accounts.filter((a) => a.businessId === c.id),
    }));
    if (!q) return rows;
    return rows.filter(
      (r) => r.client.name.toLowerCase().includes(q) || r.accounts.some((a) => a.username.toLowerCase().includes(q))
    );
  }, [clients, accounts, filter]);

  const adminAccounts = useMemo(() => (accounts ?? []).filter((a) => a.isAdmin), [accounts]);

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
          id="client-access-username"
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
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          Role
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as "admin" | "owner" | "staff")}
            style={{ padding: 6 }}
            title={
              newRole === "admin"
                ? "Full platform access, same as the admin/admin login — not scoped to one client."
                : "Sets this business's current Owner/Staff panel preset as this login's starting access (see Role Defaults below) — a one-time copy, editable per-account afterward."
            }
          >
            <option value="admin">Admin (platform)</option>
            <option value="owner">Owner (client)</option>
            <option value="staff">Staff (client)</option>
          </select>
        </label>
        <button onClick={createAccount} disabled={creating || (!isAdmin && !clients?.length)} style={primaryButtonStyle}>
          {creating ? "Creating…" : "+ Create login"}
        </button>
      </div>

      {message && <p style={{ fontSize: 13, opacity: 0.85, marginTop: 8 }}>{message}</p>}

      {!isAdmin && businessId && (
        <div style={{ marginTop: 20, border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 8 }}>
            Teams — {clients?.find((c) => c.id === businessId)?.name ?? "this client"}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0 }}>
            A login with no allow-list of its own falls back to its team&apos;s default panels, if it has one —
            its own allow-list still wins whenever it&apos;s set.
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: teams.length > 0 ? 10 : 0 }}>
            {teams.map((t) => (
              <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)" }}>
                {t.name} <span style={{ color: "var(--text-faint)" }}>({t.memberCount})</span>
                <button onClick={() => toggleTeamPanelsBox(t)} className="plain" style={{ fontSize: 11, color: "var(--accent)" }}>
                  panels
                </button>
                <button onClick={() => deleteTeam(t)} className="plain" style={{ color: "var(--danger)", fontSize: 11, padding: 0 }}>✕</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ padding: 6, fontSize: 12, flex: 1, maxWidth: 200 }}
              placeholder="New team name"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
            />
            <button onClick={createTeam} disabled={creatingTeam || !newTeamName.trim()} style={{ fontSize: 12, padding: "6px 10px" }}>
              {creatingTeam ? "Adding…" : "+ Add team"}
            </button>
          </div>
          {teamMessage && <p style={{ fontSize: 12, marginTop: 6 }}>{teamMessage}</p>}

          {teamPanelsExpandedId && (
            <div style={{ marginTop: 14 }}>
              <Collapsible title={`Default panels for "${teams.find((t) => t.id === teamPanelsExpandedId)?.name}"`} defaultOpen>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                  {ALL_PANELS.map((p) => {
                    const selected = pendingTeamPanels[teamPanelsExpandedId] ?? [];
                    return (
                      <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={selected.includes(p.id)}
                          onChange={() =>
                            setPendingTeamPanels((prev) => {
                              const current = prev[teamPanelsExpandedId] ?? [];
                              const next = current.includes(p.id) ? current.filter((x) => x !== p.id) : [...current, p.id];
                              return { ...prev, [teamPanelsExpandedId]: next };
                            })
                          }
                        />
                        {p.label}
                      </label>
                    );
                  })}
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                  <button
                    onClick={() => saveTeamPanels(teams.find((t) => t.id === teamPanelsExpandedId)!)}
                    style={primaryButtonStyle}
                  >
                    Save
                  </button>
                  <button onClick={() => setTeamPanelsExpandedId(null)}>Cancel</button>
                </div>
              </Collapsible>
            </div>
          )}
        </div>
      )}

      {!isAdmin && businessId && (
        <div style={{ marginTop: 20, border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 8 }}>
            Role Defaults — {clients?.find((c) => c.id === businessId)?.name ?? "this client"}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0 }}>
            Panels a new login starts with when created as Owner or Staff above — a one-time copy at creation,
            not a live link, so changing this never affects a login already created.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            {(["owner", "staff"] as const).map((role) => (
              <button key={role} onClick={() => togglePresetEditor(role)} style={{ fontSize: 12, padding: "6px 12px" }}>
                Edit {role === "owner" ? "Owner" : "Staff"} defaults
                {rolePresets[role] && ` (${rolePresets[role]!.length}/${ALL_PANELS.length})`}
              </button>
            ))}
          </div>

          {presetEditingRole && (
            <div style={{ marginTop: 14 }}>
              <Collapsible title={`Default panels for ${presetEditingRole === "owner" ? "Owner" : "Staff"} logins`} defaultOpen>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                  {ALL_PANELS.map((p) => (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={pendingPresetPanels.includes(p.id)}
                        onChange={() =>
                          setPendingPresetPanels((prev) =>
                            prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                          )
                        }
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                  <button onClick={saveRolePreset} disabled={savingPreset} style={primaryButtonStyle}>
                    {savingPreset ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setPresetEditingRole(null)}>Cancel</button>
                </div>
              </Collapsible>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Every client</h3>
        <input
          style={{ padding: 6, fontSize: 13, width: 200 }}
          placeholder="Filter by username or client…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {!clientRows && <p>Loading…</p>}

      {clientRows && (
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <th style={cellStyle}>Username</th>
              <th style={cellStyle}>Role</th>
              <th style={cellStyle}>Client</th>
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}>Panels</th>
              <th style={cellStyle}>Team</th>
              <th style={cellStyle}>Password</th>
              <th style={cellStyle}>Last login</th>
              <th style={cellStyle}>Created</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {clientRows.map(({ client, accounts: rows }) =>
              rows.length > 0 ? (
                rows.map((a) => renderAccountRow(a))
              ) : (
                <tr key={client.id}>
                  <td style={cellStyle}>
                    <span style={badgeStyle("warn")}>No login set</span>
                  </td>
                  <td style={cellStyle}>{client.name}</td>
                  <td style={cellStyle} colSpan={7}>
                    <span style={{ fontSize: 12, color: "var(--text-faint)" }}>This client can&apos;t log in yet.</span>
                  </td>
                  <td style={cellStyle}>
                    <button onClick={() => quickCreateFor(client.id)}>+ Create login</button>
                  </td>
                </tr>
              )
            )}
            {adminAccounts.map((a) => renderAccountRow(a))}
            {clientRows.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={10}>
                  {clients?.length === 0 ? "No clients yet — add one in the Clients tab." : "No clients match that filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );

  function renderAccountRow(a: ClientAccount) {
    const panelCount = a.allowedPanels?.length ?? ALL_PANELS.length;
    const restricted = a.allowedPanels !== null;
    const selected = pendingPanels[a.id] ?? a.allowedPanels ?? ALL_PANELS.map((p) => p.id);

    return (
      <Fragment key={a.id}>
        <tr>
          <td style={cellStyle}>{a.username}</td>
          <td style={cellStyle}>
            {a.isAdmin ? (
              <span style={badgeStyle("info")}>Admin</span>
            ) : a.role ? (
              <span style={badgeStyle(a.role === "owner" ? "ok" : "neutral")}>{a.role === "owner" ? "Owner" : "Staff"}</span>
            ) : (
              <span style={{ color: "var(--text-faint)" }}>—</span>
            )}
          </td>
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
          <td style={cellStyle}>
            {a.isAdmin ? (
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>—</span>
            ) : a.businessId === businessId ? (
              <select
                value={a.teamId ?? ""}
                onChange={(e) => assignTeam(a, e.target.value)}
                disabled={busyId === a.id}
                style={{ fontSize: 12, padding: 4 }}
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                {teams.find((t) => t.id === a.teamId)?.name ?? "—"}
              </span>
            )}
          </td>
          <td style={cellStyle}>
            <button onClick={() => togglePasswordBox(a)} className="plain" style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Change / history
            </button>
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
            <td style={{ ...cellStyle, borderTop: "none" }} colSpan={9}>
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
        {pwExpandedId === a.id && (
          <tr>
            <td style={{ ...cellStyle, borderTop: "none" }} colSpan={9}>
              <Collapsible title={`Password & activity for "${a.username}"`} defaultOpen>
                <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0 }}>
                  Existing passwords can&apos;t be viewed (stored hashed, never in plain text) — set a new one
                  below. This immediately signs out any of their active sessions.
                </p>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                  <input
                    style={{ padding: 8, minWidth: 180 }}
                    placeholder="New password (min 8 chars)"
                    type={pwShow[a.id] ? "text" : "password"}
                    value={pwDraft[a.id] ?? ""}
                    onChange={(e) => setPwDraft((prev) => ({ ...prev, [a.id]: e.target.value }))}
                  />
                  <button type="button" onClick={() => setPwDraft((prev) => ({ ...prev, [a.id]: generatePassword() }))}>
                    Generate
                  </button>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={!!pwShow[a.id]}
                      onChange={(e) => setPwShow((prev) => ({ ...prev, [a.id]: e.target.checked }))}
                    />
                    Show
                  </label>
                  <button onClick={() => savePassword(a)} disabled={busyId === a.id} style={primaryButtonStyle}>
                    {busyId === a.id ? "Saving…" : "Set new password"}
                  </button>
                  <button onClick={() => setPwExpandedId(null)}>Close</button>
                </div>
                {pwMessage && <p style={{ fontSize: 12.5, marginTop: 0, marginBottom: 10 }}>{pwMessage}</p>}

                <div style={{ fontSize: 11, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 6 }}>
                  Activity history
                </div>
                {!activity[a.id] && <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</p>}
                {activity[a.id]?.length === 0 && <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No changes since this login was created.</p>}
                {activity[a.id] && activity[a.id]!.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {activity[a.id]!.map((h, i) => (
                      <div key={i} style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 12, maxWidth: 420 }}>
                        <span>{describeActivity(h)} — by <strong>{h.changedBy}</strong></span>
                        <span style={{ color: "var(--text-faint)", flexShrink: 0 }}>{new Date(h.changedAt).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Collapsible>
            </td>
          </tr>
        )}
      </Fragment>
    );
  }
}
