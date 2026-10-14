"use client";

import { Fragment, useEffect, useState } from "react";

import { generatePassword } from "./ClientAccessPanel";
import { showConfirm } from "../lib/app-dialog";

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
    const confirmed = await showConfirm(`Delete the admin login "${account.username}"? This cannot be undone.`);
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
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Admin users</span>
        {accounts && accounts.length > 0 && (
          <span className="data" style={{ fontSize: 11 }}>{accounts.length} total</span>
        )}
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0 }}>
          Full-platform logins, same access as the fixed admin identity you sign in with today —
          that one keeps working as-is (it&apos;s checked first at sign-in); these are additional,
          self-service admin logins you can create, rotate, or revoke instantly, no deploy needed.
        </p>

        <div className="toolbar" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>
            <span className="instrument-label">Username</span>
            <input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 190 }}>
            <span className="instrument-label">Password</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                placeholder="Min 8 characters"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="ghost sm" onClick={() => setPassword(generatePassword())}>
                Generate
              </button>
            </div>
          </label>
          <label className="field" style={{ flex: "0 0 auto" }}>
            <span className="instrument-label">Reveal</span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, height: 34 }}>
              <input
                type="checkbox"
                aria-label="Show password while typing"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Show as I type
            </label>
          </label>
          <button onClick={createAccount} disabled={creating || !username.trim() || password.length < 8} className="primary">
            {creating ? "Creating…" : "Create admin login"}
          </button>
        </div>

        {message && (
          <div style={{ marginTop: 12 }}>
            {message.startsWith("Error") ? (
              <span className="lamp lamp-err">{message}</span>
            ) : (
              <span className="lamp lamp-ok">{message}</span>
            )}
          </div>
        )}

        {!accounts && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            <div className="skeleton" style={{ height: 28 }} />
            <div className="skeleton" style={{ height: 28 }} />
          </div>
        )}

        {accounts?.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No additional admin logins</div>
            <div className="empty-state-description">
              Create one above with the form above — it works like a client login, instantly and without a deploy.
            </div>
          </div>
        )}

        {accounts && accounts.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Username</th>
                  <th scope="col">Status</th>
                  <th scope="col">Password</th>
                  <th scope="col">Last login</th>
                  <th scope="col">Created</th>
                  <th scope="col"><span style={{ display: "inline-block", width: 132 }}>Manage</span></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <Fragment key={a.id}>
                    <tr>
                      <td><span style={{ color: "var(--ink)", fontWeight: 500 }}>{a.username}</span></td>
                      <td>
                        <span className={a.disabled ? "lamp lamp-err" : "lamp lamp-ok"}>
                          {a.disabled ? "Disabled" : "Active"}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => togglePasswordBox(a)} className="plain sm">
                          Change / reveal
                        </button>
                      </td>
                      <td><span className="data">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "Never"}</span></td>
                      <td><span className="data">{new Date(a.createdAt).toLocaleDateString()}</span></td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="ghost sm"
                            onClick={() => setDisabled(a, !a.disabled)}
                            disabled={busyId === a.id}
                          >
                            {busyId === a.id ? "Working…" : a.disabled ? "Re-enable" : "Disable"}
                          </button>
                          <button
                            className="danger sm"
                            onClick={() => deleteAccount(a)}
                            disabled={busyId === a.id}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {pwExpandedId === a.id && (
                      <tr>
                        <td style={{ background: "var(--panel-sunk)" }} colSpan={6}>
                          <div className="toolbar" style={{ marginBottom: 10, alignItems: "flex-end" }}>
                            <button
                              type="button"
                              className="ghost sm"
                              onClick={() => revealPassword(a)}
                              disabled={revealing === a.id}
                            >
                              {revealing === a.id
                                ? "Revealing…"
                                : a.id in revealed
                                  ? "Hide password"
                                  : "Show current password"}
                            </button>
                            {a.id in revealed && (
                              <code className="data" style={{ padding: "5px 9px", background: "var(--panel-sunk)", borderRadius: 6, fontSize: 12.5 }}>
                                {revealed[a.id] ?? "(unavailable — set a new one below)"}
                              </code>
                            )}
                          </div>
                          <div className="toolbar" style={{ marginBottom: 0, alignItems: "flex-end" }}>
                            <label className="field" style={{ flex: 1, minWidth: 190 }}>
                              <span className="instrument-label">New password</span>
                              <input
                                placeholder="Min 8 characters"
                                type={pwShow[a.id] ? "text" : "password"}
                                value={pwDraft[a.id] ?? ""}
                                onChange={(e) => setPwDraft((prev) => ({ ...prev, [a.id]: e.target.value }))}
                              />
                            </label>
                            <button
                              type="button"
                              className="ghost sm"
                              onClick={() => setPwDraft((prev) => ({ ...prev, [a.id]: generatePassword() }))}
                            >
                              Generate
                            </button>
                            <label className="field" style={{ flex: "0 0 auto" }}>
                              <span className="instrument-label">Reveal</span>
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, height: 34 }}>
                                <input
                                  type="checkbox"
                                  aria-label={`Show new password for ${a.username}`}
                                  checked={!!pwShow[a.id]}
                                  onChange={(e) => setPwShow((prev) => ({ ...prev, [a.id]: e.target.checked }))}
                                />
                                Show
                              </label>
                            </label>
                            <button onClick={() => savePassword(a)} disabled={busyId === a.id} className="primary">
                              {busyId === a.id ? "Saving…" : "Set new password"}
                            </button>
                            <button className="ghost sm" onClick={() => setPwExpandedId(null)}>Close</button>
                          </div>
                          {pwMessage && (
                            <div style={{ marginTop: 10 }}>
                              {pwMessage.startsWith("Error") ? (
                                <span className="lamp lamp-err">{pwMessage}</span>
                              ) : pwMessage.startsWith("Password changed") ? (
                                <span className="lamp lamp-ok">{pwMessage}</span>
                              ) : (
                                <span className="lamp lamp-warn">{pwMessage}</span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}