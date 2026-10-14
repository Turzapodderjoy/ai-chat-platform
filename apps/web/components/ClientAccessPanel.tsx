"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { Collapsible } from "./Collapsible";
import { showConfirm } from "../lib/app-dialog";

interface Client {
  id: string;
  name: string;
  aiEnabled: boolean;
  hermesEnabled: boolean;
  hermesProfile: string | null;
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
  isAgent: boolean;
  teamId: string | null;
  role: string | null;
  maxDevices: number | null;
  deviceCount: number;
}

interface DeviceIp {
  id: string;
  ip: string;
  fixed: boolean;
  blocked: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
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
  { id: "products", label: "Product Catalog" },
  { id: "inventory", label: "Inventory" },
  { id: "notifications", label: "Notifications" },
  { id: "orders", label: "Orders" },
  { id: "delivery", label: "Delivery" },
  { id: "repairs", label: "Repairs" },
  { id: "allchats", label: "All Chats" },
  { id: "channels", label: "Integrations" },
  { id: "replysettings", label: "Reply Timing" },
  { id: "contacts", label: "Customer Database" },
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
  if (entry.action === "password_revealed") return "Password revealed";
  if (entry.action === "username") return `Username changed (${entry.detail})`;
  if (entry.action === "disabled") return "Login restricted";
  if (entry.action === "enabled") return "Login re-enabled";
  if (entry.action === "device_fixed") return "Device locked to a single IP";
  if (entry.action === "device_blocked") return "Device IP blocked";
  if (entry.action === "device_reset") return "Device/IP limits reset";
  if (entry.action === "max_devices") return `Max devices set to ${entry.detail}`;

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

export function generatePassword(length = 14): string {
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

  // Hermes agent profiles for assignment dropdown
  const [hermesAgents, setHermesAgents] = useState<Array<{ slug: string; name?: string }>>([]);
  const [fetchingAgents, setFetchingAgents] = useState(false);

  // Password reset -- there's no "view" for an existing password
  // (hashed, one-way), only change-and-log-it. pwExpandedId mirrors
  // expandedId's pattern but is a separate toggle since a row can open
  // either box independently. The box also shows the account's FULL
  // activity trail (password resets, panel changes, restrict/enable),
  // not just password resets -- see AccountActivityLog.
  const [pwExpandedId, setPwExpandedId] = useState<string | null>(null);
  const [pwDraft, setPwDraft] = useState<Record<string, string>>({});
  const [pwShow, setPwShow] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, string | null>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [activity, setActivity] = useState<Record<string, ActivityEntry[]>>({});
  const [pwMessage, setPwMessage] = useState("");

  function refreshActivity(accountId: string) {
    fetch(`/api/admin/client-accounts/activity?id=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((d: { history: ActivityEntry[] }) => setActivity((prev) => ({ ...prev, [accountId]: d.history ?? [] })));
  }

  // Device/IP limiting -- one IP row per device a login has ever
  // signed in from. devExpandedId mirrors pwExpandedId's own pattern.
  const [devExpandedId, setDevExpandedId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Record<string, DeviceIp[]>>({});
  const [devBusy, setDevBusy] = useState<string | null>(null);
  const [maxDevicesDraft, setMaxDevicesDraft] = useState<Record<string, string>>({});
  const [devMessage, setDevMessage] = useState("");

  function refreshDevices(accountId: string) {
    fetch(`/api/admin/client-accounts/devices?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((d: { devices: DeviceIp[] }) => setDevices((prev) => ({ ...prev, [accountId]: d.devices ?? [] })));
  }

  function toggleDeviceBox(account: ClientAccount) {
    if (devExpandedId === account.id) {
      setDevExpandedId(null);
      return;
    }
    setDevExpandedId(account.id);
    setDevMessage("");
    setMaxDevicesDraft((prev) => ({ ...prev, [account.id]: prev[account.id] ?? String(account.maxDevices ?? "") }));
    refreshDevices(account.id);
  }

  async function saveMaxDevices(account: ClientAccount) {
    const raw = maxDevicesDraft[account.id] ?? "";
    const max = raw.trim() === "" ? null : Number(raw);
    if (max !== null && (isNaN(max) || max < 1)) {
      setDevMessage("Max devices must be a positive number, or blank for the role default.");
      return;
    }
    setDevBusy(account.id);
    try {
      await fetch("/api/admin/client-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, maxDevices: max }),
      });
      setDevMessage("Saved.");
      refresh();
    } finally {
      setDevBusy(null);
    }
  }

  async function deviceAction(account: ClientAccount, action: "fix" | "block" | "reset", deviceId?: string) {
    setDevBusy(account.id);
    setDevMessage("");
    try {
      const res = await fetch("/api/admin/client-accounts/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, action, deviceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDevMessage(`Error: ${data.error ?? "failed"}`);
        return;
      }
      refreshDevices(account.id);
      refresh();
    } finally {
      setDevBusy(null);
    }
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
    if (!(await showConfirm(`Delete team "${team.name}"? Members keep their own login, just lose this team's default panel access.`))) return;
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

  const [togglingAi, setTogglingAi] = useState(false);
  const [togglingHermes, setTogglingHermes] = useState(false);

  // Takes effect on the very next customer message -- ChatService reads
  // Business.aiEnabled fresh on every chat() call, nothing cached. Off
  // also hides every per-conversation Stop/Resume AI control for this
  // client everywhere it appears (Inbox, Agent Console), since toggling
  // one conversation back to "bot" would be a no-op lie once the whole
  // client's AI is off -- see AllChatsPanel/AgentConsole.
  async function toggleAi(client: Client) {
    setTogglingAi(true);
    try {
      await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiEnabled: !client.aiEnabled }),
      });
      refresh();
    } finally {
      setTogglingAi(false);
    }
  }

  // AI Engine: chat() cuts the customer's conversations over to the
  // client's agent profile (the AIVA AI engine). Requires a
  // provisioned profile; without one the chat fails closed to the
  // canned handoff message. Read fresh on every message.
  async function toggleHermes(client: Client) {
    setTogglingHermes(true);
    try {
      await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hermesEnabled: !client.hermesEnabled }),
      });
      refresh();
    } finally {
      setTogglingHermes(false);
    }
  }

  useEffect(refresh, []);

  useEffect(() => {
    setFetchingAgents(true);
    fetch("/api/admin/hermes-agents")
      .then((r) => r.json())
      .then((data) => {
        const agents = (data.agents ?? []).map((a: { slug: string; model?: string | null; provider?: string | null }) => ({
          slug: a.slug,
          name: a.slug + (a.model ? ` (${a.model}${a.provider ? ` · ${a.provider}` : ""})` : ""),
        }));
        setHermesAgents(agents);
      })
      .catch(() => setHermesAgents([]))
      .finally(() => setFetchingAgents(false));
  }, []);

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

  async function revealPassword(account: ClientAccount) {
    if (account.id in revealed) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[account.id];
        return next;
      });
      return;
    }
    setRevealing(account.id);
    try {
      const res = await fetch(`/api/admin/client-accounts?revealId=${encodeURIComponent(account.id)}`);
      const data = await res.json();
      setRevealed((prev) => ({ ...prev, [account.id]: data.password ?? null }));
    } finally {
      setRevealing(null);
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
    if (!(account.id in devices)) refreshDevices(account.id);
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
    const confirmed = await showConfirm(
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

/* ── Presentation: hairline panels, lamps for state, mono for numbers ── */
const SECTION: CSSProperties = {
  marginTop: 16,
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  boxShadow: "var(--edge-light)",
};

const SECTION_HEAD: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "10px 16px",
  borderBottom: "1px solid var(--line-soft)",
};

const SECTION_BODY: CSSProperties = { padding: 16 };

const HEAD_TEXT: CSSProperties = { maxWidth: "64ch" };

const DESC: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  lineHeight: 1.55,
  color: "var(--ink-3)",
};

const CONTROL_ROW: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-end",
  flexWrap: "wrap",
};

const CHECK_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
  gap: 8,
};

const CHECK: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 13,
  color: "var(--ink-2)",
};

const SWITCH: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: 12.5,
  color: "var(--ink-2)",
};

const CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "4px 10px",
  borderRadius: "var(--r-pill)",
  border: "1px solid var(--line)",
  background: "var(--panel)",
  fontSize: 12.5,
  color: "var(--ink-2)",
};

const ROW_BETWEEN: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 12.5,
};

const SUBLIST: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

const SUBROW: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 12.5,
  color: "var(--ink-2)",
};

const EXPANDED_CELL: CSSProperties = { padding: 0, background: "var(--panel-sunk)" };

const DEVICE_LAMP: Record<string, string> = {
  active: "lamp lamp-idle",
  fixed: "lamp lamp-ok",
  blocked: "lamp lamp-err",
};

const DEVICE_LABEL: Record<string, string> = {
  active: "Active",
  fixed: "Fixed",
  blocked: "Blocked",
};

function deviceState(d: DeviceIp): "active" | "fixed" | "blocked" {
  if (d.blocked) return "blocked";
  if (d.fixed) return "fixed";
  return "active";
}

return (
    <section className="panel" style={{ overflow: "visible" }}>
      <div className="panel-head">
        <span className="instrument-label">Client access</span>
        <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {accounts?.length ?? 0} logins
        </span>
      </div>

      <div className="panel-body">
        <p style={{ ...DESC, marginBottom: 14 }}>
          Create a login for a client — they sign in at the main site and land straight on their own dashboard
          (/dashboard/&#123;id&#125;), nowhere else. A client can have more than one login (e.g. different staff).
          Disabling a login kicks out any session they&apos;re already in, immediately.
        </p>

        {/* ── Create a login ── */}
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="field" style={{ minWidth: 180 }}>
            <label className="field-label" htmlFor="client-access-client">Client</label>
            <select
              id="client-access-client"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              disabled={isAdmin}
              style={{ fontSize: 13 }}
            >
              {!clients && <option>Loading…</option>}
              {clients?.length === 0 && <option>No clients yet</option>}
              {clients?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ minWidth: 160 }}>
            <label className="field-label" htmlFor="client-access-username">Username</label>
            <input
              id="client-access-username"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>

          <div className="field" style={{ minWidth: 190 }}>
            <label className="field-label" htmlFor="client-access-password">Password</label>
            <input
              id="client-access-password"
              placeholder="Min 8 characters"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>

          <button type="button" onClick={() => setPassword(generatePassword())} className="ghost sm">
            Generate
          </button>

          <label style={SWITCH}>
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            Show
          </label>

          <div className="field" style={{ minWidth: 170 }}>
            <label className="field-label" htmlFor="client-access-role">Role</label>
            <select
              id="client-access-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "admin" | "owner" | "staff")}
              title={
                newRole === "admin"
                  ? "Full platform access, same as the admin/admin login — not scoped to one client."
                  : "Sets this business's current Owner/Staff panel preset as this login's starting access (see Role defaults below) — a one-time copy, editable per-account afterward."
              }
              style={{ fontSize: 13 }}
            >
              <option value="admin">Admin (platform)</option>
              <option value="owner">Owner (client)</option>
              <option value="staff">Staff (client)</option>
            </select>
          </div>

          <button onClick={createAccount} disabled={creating || (!isAdmin && !clients?.length)} className="primary">
            {creating ? "Creating" : "Create login"}
          </button>
        </div>

        {message && (
          <p
            className="meta"
            style={{
              marginTop: 10,
              padding: "8px 11px",
              borderRadius: "var(--r-sm)",
              background: message.startsWith("Error") ? "var(--danger-subtle)" : "var(--accent-subtle)",
              color: message.startsWith("Error") ? "var(--danger)" : "var(--ink-2)",
            }}
          >
            {message}
          </p>
        )}

        {/* ── AI replies ── */}
        {!isAdmin && businessId && clients?.find((c) => c.id === businessId) && (
          <div style={SECTION}>
            <div style={SECTION_HEAD}>
              <div style={HEAD_TEXT}>
                <span className="instrument-label">AI replies</span>
                <p style={{ ...DESC, marginTop: 4 }}>
                  Off stops the AI from answering this client&apos;s customers everywhere (website, Messenger,
                  Instagram, WhatsApp) — takes effect on the very next message, no restart. Also hides the
                  per-conversation Stop/Resume AI control for every login of this client, since it&apos;d be a
                  no-op while this is off.
                </p>
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className={clients.find((c) => c.id === businessId)?.aiEnabled ? "lamp lamp-ok" : "lamp lamp-err"}>
                  {clients.find((c) => c.id === businessId)?.aiEnabled ? "On" : "Off"}
                </span>
                <button
                  onClick={() => toggleAi(clients!.find((c) => c.id === businessId)!)}
                  disabled={togglingAi}
                  aria-pressed={!!clients.find((c) => c.id === businessId)?.aiEnabled}
                  className={clients.find((c) => c.id === businessId)?.aiEnabled ? "ghost sm" : "machine sm"}
                >
                  {clients.find((c) => c.id === businessId)?.aiEnabled ? "Turn off AI replies" : "Turn on AI replies"}
                </button>
              </span>
            </div>
          </div>
        )}

        {/* ── AI engine ── */}
        {!isAdmin && businessId && clients?.find((c) => c.id === businessId) && (
          <div style={SECTION}>
            <div style={SECTION_HEAD}>
              <div style={HEAD_TEXT}>
                <span className="instrument-label">AI engine</span>
                <p style={{ ...DESC, marginTop: 4 }}>
                  Runs this client&apos;s AI on the agent engine instead of the legacy pipeline (website,
                  Messenger, Instagram, WhatsApp). Requires a provisioned agent profile; takes effect on the
                  very next message. Needs this client&apos;s AI replies (above) to be on.
                </p>
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className={clients.find((c) => c.id === businessId)?.hermesEnabled ? "lamp lamp-machine" : "lamp lamp-idle"}>
                  {clients.find((c) => c.id === businessId)?.hermesEnabled ? "Engine on" : "Legacy pipeline"}
                </span>
                <button
                  onClick={() => toggleHermes(clients!.find((c) => c.id === businessId)!)}
                  disabled={togglingHermes}
                  aria-pressed={!!clients.find((c) => c.id === businessId)?.hermesEnabled}
                  className={clients.find((c) => c.id === businessId)?.hermesEnabled ? "ghost sm" : "machine sm"}
                >
                  {clients.find((c) => c.id === businessId)?.hermesEnabled ? "Turn off agent engine" : "Turn on agent engine"}
                </button>
              </span>
            </div>
            <div style={{ ...SECTION_BODY, paddingTop: 12, borderTop: "none" }}>
              <div className="field" style={{ maxWidth: 320 }}>
                <label className="field-label" htmlFor="client-access-agent">Agent profile</label>
                <select
                  id="client-access-agent"
                  value={clients.find((c) => c.id === businessId)?.hermesProfile ?? ""}
                  onChange={(e) => {
                    const profile = e.target.value || null;
                    fetch(`/api/admin/clients/${businessId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ hermesProfile: profile }),
                    }).then(() => refresh());
                  }}
                  disabled={fetchingAgents || togglingHermes}
                  style={{ fontSize: 13 }}
                >
                  <option value="">None (use default)</option>
                  {hermesAgents.map((a) => (
                    <option key={a.slug} value={a.slug}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── Teams ── */}
        {!isAdmin && businessId && (
          <div style={SECTION}>
            <div style={SECTION_HEAD}>
              <span className="instrument-label">
                Teams — {clients?.find((c) => c.id === businessId)?.name ?? "this client"}
              </span>
              <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>{teams.length} teams</span>
            </div>
            <div style={SECTION_BODY}>
              <p style={{ ...DESC, marginBottom: 12 }}>
                A login with no allow-list of its own falls back to its team&apos;s default panels, if it has one —
                its own allow-list still wins whenever it&apos;s set.
              </p>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {teams.length === 0 && (
                  <span className="meta" style={{ color: "var(--ink-3)" }}>
                    No teams yet. Add one to hand a group of logins a shared panel default.
                  </span>
                )}
                {teams.map((t) => (
                  <span key={t.id} style={CHIP}>
                    <span style={{ color: "var(--ink)" }}>{t.name}</span>
                    <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>{t.memberCount} members</span>
                    <button onClick={() => toggleTeamPanelsBox(t)} className="plain" style={{ fontSize: 12, color: "var(--accent)" }}>
                      Panels
                    </button>
                    <button onClick={() => deleteTeam(t)} className="plain" aria-label={`Delete team ${t.name}`} title={`Delete team ${t.name}`} style={{ color: "var(--danger)", fontSize: 12, padding: 2 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>

              <div className="field" style={{ maxWidth: 280 }}>
                <label className="field-label" htmlFor="client-access-new-team">New team</label>
                <input
                  id="client-access-new-team"
                  placeholder="Team name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>
              <button onClick={createTeam} disabled={creatingTeam || !newTeamName.trim()} className="ghost sm" style={{ marginTop: 8 }}>
                {creatingTeam ? "Adding" : "Add team"}
              </button>

              {teamMessage && <p className="meta" style={{ marginTop: 8 }}>{teamMessage}</p>}

              {teamPanelsExpandedId && (
                <div style={{ marginTop: 14 }}>
                  <Collapsible title={`Default panels for "${teams.find((t) => t.id === teamPanelsExpandedId)?.name}"`} defaultOpen>
                    <div style={CHECK_GRID}>
                      {ALL_PANELS.map((p) => {
                        const selected = pendingTeamPanels[teamPanelsExpandedId] ?? [];
                        return (
                          <label key={p.id} style={CHECK}>
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
                      <button onClick={() => saveTeamPanels(teams.find((t) => t.id === teamPanelsExpandedId)!)} className="primary sm">
                        Save default panels
                      </button>
                      <button onClick={() => setTeamPanelsExpandedId(null)} className="ghost sm">
                        Cancel
                      </button>
                    </div>
                  </Collapsible>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Role defaults ── */}
        {!isAdmin && businessId && (
          <div style={SECTION}>
            <div style={SECTION_HEAD}>
              <span className="instrument-label">
                Role defaults — {clients?.find((c) => c.id === businessId)?.name ?? "this client"}
              </span>
            </div>
            <div style={SECTION_BODY}>
              <p style={{ ...DESC, marginBottom: 12 }}>
                Panels a new login starts with when created as Owner or Staff above — a one-time copy at creation,
                not a live link, so changing this never affects a login already created.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["owner", "staff"] as const).map((role) => (
                  <button key={role} onClick={() => togglePresetEditor(role)} className="ghost sm">
                    Edit {role === "owner" ? "Owner" : "Staff"} defaults
                    <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {rolePresets[role] ? `${rolePresets[role]!.length}/${ALL_PANELS.length}` : `All ${ALL_PANELS.length}`}
                    </span>
                  </button>
                ))}
              </div>

              {presetEditingRole && (
                <div style={{ marginTop: 14 }}>
                  <Collapsible title={`Default panels for ${presetEditingRole === "owner" ? "Owner" : "Staff"} logins`} defaultOpen>
                    <div style={CHECK_GRID}>
                      {ALL_PANELS.map((p) => (
                        <label key={p.id} style={CHECK}>
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
                      <button onClick={saveRolePreset} disabled={savingPreset} className="primary sm">
                        {savingPreset ? "Saving" : "Save default panels"}
                      </button>
                      <button onClick={() => setPresetEditingRole(null)} className="ghost sm">
                        Cancel
                      </button>
                    </div>
                  </Collapsible>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Every client ── */}
        <div style={{ ...SECTION, marginTop: 20 }}>
          <div className="panel-head">
            <span className="instrument-label">Every client</span>
            <div className="field" style={{ minWidth: 200 }}>
              <label className="field-label" htmlFor="client-access-filter">Filter</label>
              <input
                id="client-access-filter"
                placeholder="Username or client"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ fontSize: 13 }}
              />
            </div>
          </div>

          <div style={{ padding: 16 }}>
            {!clientRows && <p className="meta">Loading logins…</p>}

            {clientRows && clientRows.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-title">No clients to show</div>
                <div className="empty-state-description">
                  {clients?.length === 0
                    ? "No clients yet — add one in the Clients tab, then create its first login here."
                    : "No client matches this filter. Clear it to see every login."}
                </div>
              </div>
            )}

            {clientRows && clientRows.length > 0 && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Client</th>
                      <th>Status</th>
                      <th>Panels</th>
                      <th>Team</th>
                      <th>Password</th>
                      <th>Devices</th>
                      <th>Last login</th>
                      <th>Created</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {clientRows.map(({ client, accounts: rows }) =>
                      rows.length > 0 ? (
                        rows.map((a) => renderAccountRow(a))
                      ) : (
                        <tr key={client.id}>
                          <td><span className="lamp lamp-warn">No login set</span></td>
                          <td>{client.name}</td>
                          <td colSpan={8}>
                            <span className="meta">This client can&apos;t log in yet.</span>
                          </td>
                          <td>
                            <button onClick={() => quickCreateFor(client.id)} className="primary sm">
                              Create login
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                    {adminAccounts.map((a) => renderAccountRow(a))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  function renderAccountRow(a: ClientAccount) {
    const panelCount = a.allowedPanels?.length ?? ALL_PANELS.length;
    const restricted = a.allowedPanels !== null;
    const selected = pendingPanels[a.id] ?? a.allowedPanels ?? ALL_PANELS.map((p) => p.id);
    const roleLabel = a.isAdmin ? "Admin" : a.role === "owner" ? "Owner" : a.role === "staff" ? "Staff" : null;
    const deviceLimit = a.maxDevices ?? (a.role === "owner" ? 2 : 1);

    return (
      <Fragment key={a.id}>
        <tr>
          <td style={{ fontWeight: 600, color: "var(--ink)" }}>{a.username}</td>
          <td>
            {roleLabel ? (
              <span style={{ color: a.role === "owner" ? "var(--ink)" : "var(--ink-2)", fontWeight: a.role === "owner" ? 600 : 400 }}>
                {roleLabel}
              </span>
            ) : (
              <span style={{ color: "var(--ink-4)" }}>—</span>
            )}
          </td>
          <td>
            {a.isAdmin ? (
              <span className="lamp lamp-info">Platform admin</span>
            ) : (
              a.businessName
            )}
          </td>
          <td>
            <span className={a.disabled ? "lamp lamp-err" : "lamp lamp-ok"}>
              {a.disabled ? "Restricted" : "Active"}
            </span>
          </td>
          <td>
            {a.isAdmin ? (
              <span className="data meta">All panels</span>
            ) : (
              <button onClick={() => togglePanelsBox(a)} className="plain" style={{ fontSize: 12.5, color: "var(--accent)" }}>
                <span className="data">{restricted ? `${panelCount}/${ALL_PANELS.length} panels` : `All ${ALL_PANELS.length} panels`}</span>
              </button>
            )}
          </td>
          <td>
            {a.isAdmin ? (
              <span style={{ color: "var(--ink-4)" }}>—</span>
            ) : a.businessId === businessId ? (
              <select
                aria-label={`Team for ${a.username}`}
                value={a.teamId ?? ""}
                onChange={(e) => assignTeam(a, e.target.value)}
                disabled={busyId === a.id}
                style={{ fontSize: 12.5, padding: "4px 8px", width: "auto", minWidth: 120 }}
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : (
              <span className="meta">{teams.find((t) => t.id === a.teamId)?.name ?? "—"}</span>
            )}
          </td>
          <td>
            <button onClick={() => togglePasswordBox(a)} className="plain" style={{ fontSize: 12.5, color: "var(--accent)" }}>
              Change or view history
            </button>
          </td>
          <td>
            {a.isAdmin || a.isAgent ? (
              <span style={{ color: "var(--ink-4)" }}>—</span>
            ) : (
              <button onClick={() => toggleDeviceBox(a)} className="plain" style={{ fontSize: 12.5, color: "var(--accent)" }}>
                <span className="data">{a.deviceCount}/{deviceLimit} devices</span>
              </button>
            )}
          </td>
          <td>
            <span className="data" style={{ fontSize: 12 }}>
              {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "Never"}
            </span>
          </td>
          <td>
            <span className="data" style={{ fontSize: 12 }}>{new Date(a.createdAt).toLocaleDateString()}</span>
          </td>
          <td>
            <span style={{ display: "inline-flex", gap: 6 }}>
              <button
                onClick={() => setDisabled(a, !a.disabled)}
                disabled={busyId === a.id}
                className={a.disabled ? "ghost sm" : "danger sm"}
              >
                {busyId === a.id ? "…" : a.disabled ? "Re-enable" : "Restrict"}
              </button>
              <button onClick={() => deleteAccount(a)} disabled={busyId === a.id} className="danger sm">
                Delete
              </button>
            </span>
          </td>
        </tr>

        {/* Which panels */}
        {expandedId === a.id && (
          <tr>
            <td style={EXPANDED_CELL} colSpan={11}>
              <div style={{ padding: 16 }}>
                <Collapsible title={`Which panels can "${a.username}" see?`} defaultOpen>
                  <div style={CHECK_GRID}>
                    {ALL_PANELS.map((p) => (
                      <label key={p.id} style={CHECK}>
                        <input type="checkbox" checked={selected.includes(p.id)} onChange={() => togglePanel(a.id, p.id)} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                    <button onClick={() => savePanels(a)} disabled={busyId === a.id} className="primary sm">
                      {busyId === a.id ? "Saving" : "Save panel access"}
                    </button>
                    <button onClick={() => setExpandedId(null)} className="ghost sm">
                      Cancel
                    </button>
                  </div>
                </Collapsible>
              </div>
            </td>
          </tr>
        )}

        {/* Password and activity */}
        {pwExpandedId === a.id && (
          <tr>
            <td style={EXPANDED_CELL} colSpan={11}>
              <div style={{ padding: 16 }}>
                <Collapsible title={`Password and activity for "${a.username}"`} defaultOpen>
                  <p style={{ ...DESC, marginBottom: 12 }}>
                    Reveal the current password below, or set a new one — that immediately signs out any of
                    their active sessions.
                  </p>

                  <div style={{ marginBottom: 12 }}>
                    <button type="button" onClick={() => revealPassword(a)} disabled={revealing === a.id} className="ghost sm">
                      {revealing === a.id ? "Revealing" : a.id in revealed ? "Hide password" : "Show current password"}
                    </button>
                    {a.id in revealed && (
                      <div style={{ marginTop: 8 }}>
                        <code>{revealed[a.id] ?? "(unavailable — set a new one below)"}</code>
                      </div>
                    )}
                  </div>

                  <div style={CONTROL_ROW}>
                    <div className="field" style={{ minWidth: 200 }}>
                      <label className="field-label" htmlFor={`pw-draft-${a.id}`}>New password</label>
                      <input
                        id={`pw-draft-${a.id}`}
                        placeholder="Min 8 characters"
                        type={pwShow[a.id] ? "text" : "password"}
                        value={pwDraft[a.id] ?? ""}
                        onChange={(e) => setPwDraft((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <button type="button" onClick={() => setPwDraft((prev) => ({ ...prev, [a.id]: generatePassword() }))} className="ghost sm">
                      Generate
                    </button>
                    <label style={SWITCH}>
                      <input
                        type="checkbox"
                        checked={!!pwShow[a.id]}
                        onChange={(e) => setPwShow((prev) => ({ ...prev, [a.id]: e.target.checked }))}
                      />
                      Show
                    </label>
                    <button onClick={() => savePassword(a)} disabled={busyId === a.id} className="primary sm">
                      {busyId === a.id ? "Saving" : "Set new password"}
                    </button>
                    <button onClick={() => setPwExpandedId(null)} className="ghost sm">
                      Close
                    </button>
                  </div>

                  {pwMessage && (
                    <p
                      className="meta"
                      style={{
                        marginTop: 10,
                        padding: "8px 11px",
                        borderRadius: "var(--r-sm)",
                        background: pwMessage.startsWith("Error") ? "var(--danger-subtle)" : "var(--accent-subtle)",
                        color: pwMessage.startsWith("Error") ? "var(--danger)" : "var(--ink-2)",
                      }}
                    >
                      {pwMessage}
                    </p>
                  )}

                  {/* Login history */}
                  <div style={{ marginTop: 16 }}>
                    <span className="instrument-label" style={{ display: "block", marginBottom: 8 }}>Login history (device IP)</span>
                    {!devices[a.id] && <p className="meta">Loading devices…</p>}
                    {devices[a.id]?.length === 0 && (
                      <div className="empty-state">
                        <div className="empty-state-title">No devices yet</div>
                        <div className="empty-state-description">This login has never signed in from an IP address.</div>
                      </div>
                    )}
                    {devices[a.id] && devices[a.id]!.length > 0 && (
                      <div style={SUBLIST}>
                        {devices[a.id]!.map((d) => (
                          <div key={d.id} style={SUBROW}>
                            <span style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                              <code>{d.ip}</code>
                              <span className={DEVICE_LAMP[deviceState(d)]}>{DEVICE_LABEL[deviceState(d)]}</span>
                            </span>
                            <span className="data meta" style={{ flexShrink: 0 }}>
                              Last seen {new Date(d.lastSeenAt).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Activity history */}
                  <div style={{ marginTop: 16 }}>
                    <span className="instrument-label" style={{ display: "block", marginBottom: 8 }}>Activity history</span>
                    {!activity[a.id] && <p className="meta">Loading activity…</p>}
                    {activity[a.id]?.length === 0 && (
                      <div className="empty-state">
                        <div className="empty-state-title">No changes yet</div>
                        <div className="empty-state-description">Nothing has changed since this login was created.</div>
                      </div>
                    )}
                    {activity[a.id] && activity[a.id]!.length > 0 && (
                      <div style={SUBLIST}>
                        {activity[a.id]!.map((h, i) => (
                          <div key={i} style={SUBROW}>
                            <span>
                              {describeActivity(h)} — by <strong style={{ color: "var(--ink)" }}>{h.changedBy}</strong>
                            </span>
                            <span className="data meta" style={{ flexShrink: 0 }}>{new Date(h.changedAt).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Collapsible>
              </div>
            </td>
          </tr>
        )}

        {/* Devices */}
        {devExpandedId === a.id && (
          <tr>
            <td style={EXPANDED_CELL} colSpan={11}>
              <div style={{ padding: 16 }}>
                <Collapsible title={`Devices for "${a.username}"`} defaultOpen>
                  <p style={{ ...DESC, marginBottom: 12 }}>
                    Every IP this login has signed in from. Fixing one locks the login to exactly that
                    device — every other IP is refused, regardless of the limit below. Blocking one refuses
                    just that IP and frees its slot. Reset clears everything back to a clean slate.
                  </p>

                  <div style={CONTROL_ROW}>
                    <div className="field" style={{ maxWidth: 160 }}>
                      <label className="field-label" htmlFor={`max-devices-${a.id}`}>Max devices</label>
                      <input
                        id={`max-devices-${a.id}`}
                        type="number"
                        min={1}
                        placeholder={a.role === "owner" ? "2 (default)" : "1 (default)"}
                        value={maxDevicesDraft[a.id] ?? ""}
                        onChange={(e) => setMaxDevicesDraft((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        className="data"
                        style={{ width: 110 }}
                      />
                    </div>
                    <button onClick={() => saveMaxDevices(a)} disabled={devBusy === a.id} className="primary sm">
                      {devBusy === a.id ? "Saving" : "Save limit"}
                    </button>
                    <button onClick={() => deviceAction(a, "reset")} disabled={devBusy === a.id} className="ghost sm">
                      Reset limits
                    </button>
                    <button onClick={() => setDevExpandedId(null)} className="ghost sm">
                      Close
                    </button>
                  </div>

                  {devMessage && <p className="meta" style={{ marginTop: 8 }}>{devMessage}</p>}

                  <div style={{ marginTop: 14 }}>
                    {!devices[a.id] && <p className="meta">Loading devices…</p>}
                    {devices[a.id]?.length === 0 && (
                      <div className="empty-state">
                        <div className="empty-state-title">No devices yet</div>
                        <div className="empty-state-description">This login has never signed in from an IP address.</div>
                      </div>
                    )}
                    {devices[a.id] && devices[a.id]!.length > 0 && (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>IP</th>
                              <th>First seen</th>
                              <th>Last seen</th>
                              <th>Status</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {devices[a.id]!.map((d) => (
                              <tr key={d.id}>
                                <td><code>{d.ip}</code></td>
                                <td><span className="data" style={{ fontSize: 12 }}>{new Date(d.firstSeenAt).toLocaleString()}</span></td>
                                <td><span className="data" style={{ fontSize: 12 }}>{new Date(d.lastSeenAt).toLocaleString()}</span></td>
                                <td><span className={DEVICE_LAMP[deviceState(d)]}>{DEVICE_LABEL[deviceState(d)]}</span></td>
                                <td>
                                  <span style={{ display: "inline-flex", gap: 6 }}>
                                    <button onClick={() => deviceAction(a, "fix", d.id)} disabled={devBusy === a.id || d.fixed} className="ghost sm">
                                      Fix IP
                                    </button>
                                    <button onClick={() => deviceAction(a, "block", d.id)} disabled={devBusy === a.id || d.blocked} className="danger sm">
                                      Block IP
                                    </button>
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </Collapsible>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  }
}
