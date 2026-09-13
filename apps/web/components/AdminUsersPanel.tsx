"use client";

import { Fragment, useEffect, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, badgeStyle, primaryButtonStyle } from "./dashboard-styles";
import { generatePassword } from "./ClientAccessPanel";

interface AdminAccount {
  id: string;
  username: string;
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Platform-admin logins, DB-backed -- a genuine second way to be admin
 * alongside the single fixed env-var identity (ADMIN_USERNAME/PASSWORD,
 * checked first at /api/auth/login). Reuses the exact same
 * ClientAccount model and API as Client Access, just filtered to
 * isAdmin:true and without any of the business-scoped stuff (panels,
 * teams, role presets) that doesn't apply to full platform access.
 *
 * The fixed env-var identity keeps working as-is -- this doesn't
 * replace it, it adds a self-service, no-deploy way to create/rotate
 * admin logins the same instant way client logins already work. */
export function AdminUsersPanel() {
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [pwExpandedId, setPwExpandedId] = useState<string | null>(null);
  const [pwDraft, setPwDraft] = useState<Record<string, string>>({});
  const [pwShow, setPwShow] = useState<Record<string, boolean>>({});
  const [pwMessage, setPwMessage] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string | null>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  function refresh() {
    fetch("/api/admin/client-accounts")
      .then((r) => r.json())
      .then((d: { accounts: (AdminAccount & { isAdmin: boolean })[] }) =>
        setAccounts((d.accounts ?? []).filter((a) => a.isAdmin))
      );
  }

  useEffect(refresh, []);

  async function createAccount() {
    if (!username.trim() || !password) return;
    setCreating(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/client-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, isAdmin: true }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${result.error}`);
        return;
      }
      setMessage(`Admin login created for "${username}" — share these credentials now, the password won't be shown again.`);
      setUsername("");
      setPassword("");
      setShowPassword(false);
      refresh();
    } finally {
      setCreating(false);
    }
  }

  async function setDisabled(account: AdminAccount, disabled: boolean) {
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

  async function deleteAccount(account: AdminAccount) {
    const confirmed = window.confirm(`Delete the admin login "${account.username}"? This cannot be undone.`);
    if (!confirmed) return;
    setBusyId(account.id);
    try {
      await fetch(`/api/admin/client-accounts?id=${encodeURIComponent(account.id)}`, { method: "DELETE" });
      setAccounts((prev) => prev?.filter((a) => a.id !== account.id) ?? prev);
    } finally {
      setBusyId(null);
    }
  }

  function togglePasswordBox(account: AdminAccount) {
    setPwExpandedId(pwExpandedId === account.id ? null : account.id);
    setPwMessage("");
  }

  async function revealPassword(account: AdminAccount) {
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

  async function savePassword(account: AdminAccount) {
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
      setPwMessage(`Password changed for "${account.username}" — share it with them now, it won't be shown again.`);
      setPwDraft((prev) => ({ ...prev, [account.id]: "" }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Admin Users</h2>
      <p style={subtleTextStyle}>
        Full-platform logins, same access as the fixed admin identity you sign in with today — that one keeps
        working as-is (it&apos;s checked first at sign-in); these are additional, self-service admin logins you
        can create, rotate, or revoke instantly, no deploy needed.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
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
        <button onClick={createAccount} disabled={creating || !username.trim() || password.length < 8} style={primaryButtonStyle}>
          {creating ? "Creating…" : "+ Create admin login"}
        </button>
      </div>

      {message && <p style={{ fontSize: 13, opacity: 0.85, marginTop: 8 }}>{message}</p>}

      {!accounts && <p style={subtleTextStyle}>Loading…</p>}
      {accounts?.length === 0 && <p style={subtleTextStyle}>No additional admin logins yet — create one above.</p>}

      {accounts && accounts.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
            <thead>
              <tr>
                <th style={cellStyle}>Username</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Password</th>
                <th style={cellStyle}>Last login</th>
                <th style={cellStyle}>Created</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <Fragment key={a.id}>
                  <tr>
                    <td style={cellStyle}>{a.username}</td>
                    <td style={cellStyle}>
                      <span style={badgeStyle(a.disabled ? "error" : "ok")}>{a.disabled ? "Disabled" : "Active"}</span>
                    </td>
                    <td style={cellStyle}>
                      <button onClick={() => togglePasswordBox(a)} className="plain" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        Change / reveal
                      </button>
                    </td>
                    <td style={cellStyle}>{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "Never"}</td>
                    <td style={cellStyle}>{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td style={cellStyle}>
                      <button onClick={() => setDisabled(a, !a.disabled)} disabled={busyId === a.id}>
                        {busyId === a.id ? "…" : a.disabled ? "Re-enable" : "Disable"}
                      </button>{" "}
                      <button onClick={() => deleteAccount(a)} disabled={busyId === a.id}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {pwExpandedId === a.id && (
                    <tr>
                      <td style={{ ...cellStyle, background: "var(--surface)" }} colSpan={6}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                          <button type="button" onClick={() => revealPassword(a)} disabled={revealing === a.id}>
                            {revealing === a.id ? "Revealing…" : a.id in revealed ? "Hide password" : "Show current password"}
                          </button>
                          {a.id in revealed && (
                            <code style={{ padding: "6px 10px", background: "var(--bg)", borderRadius: 6, fontSize: 13 }}>
                              {revealed[a.id] ?? "(unavailable — set a new one below)"}
                            </code>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
                        {pwMessage && <p style={{ fontSize: 12.5, marginTop: 8 }}>{pwMessage}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
