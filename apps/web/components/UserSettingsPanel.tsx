"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle } from "./dashboard-styles";

interface Account {
  id: string;
  username: string;
  password: string | null;
}

function AccountRow({ account, label, onSaved }: { account: Account; label: string; onSaved: () => void }) {
  const [username, setUsername] = useState(account.username);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setUsername(account.username), [account.username]);

  async function save() {
    const body: { id: string; username?: string; password?: string } = { id: account.id };
    if (username.trim() && username.trim() !== account.username) body.username = username.trim();
    if (password.trim()) body.password = password.trim();
    if (!body.username && !body.password) return;

    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/client/user-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Couldn't save.");
        return;
      }
      setPassword("");
      setMessage("Saved.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ padding: 8, minWidth: 160 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Current password
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={showPassword ? (account.password ?? "(unavailable — reset to see it)") : "••••••••"}
              readOnly
              style={{ padding: 8, minWidth: 160, color: showPassword ? undefined : "var(--text-faint)" }}
            />
            <button type="button" onClick={() => setShowPassword((s) => !s)} style={{ fontSize: 12, padding: "6px 10px" }}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          New password (optional)
          <input
            type="text"
            placeholder="Leave blank to keep current"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 8, minWidth: 200 }}
          />
        </label>
        <button onClick={save} disabled={saving} style={{ ...primaryButtonStyle, alignSelf: "flex-end" }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {message && <p style={{ ...subtleTextStyle, marginTop: 8, marginBottom: 0 }}>{message}</p>}
    </div>
  );
}

/** Self-service login management -- every client account can change its
 * own username/password here; an owner additionally sees and manages
 * every staff login under their own business. Passwords are revealed
 * from the server on load (see /api/client/user-settings), never typed
 * in from a client-side store. */
export function UserSettingsPanel({ active = true }: { active?: boolean }) {
  const [self, setSelf] = useState<Account | null>(null);
  const [staff, setStaff] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);

  function refresh() {
    fetch("/api/client/user-settings")
      .then((r) => r.json())
      .then((d: { self: Account; staff: Account[] }) => {
        setSelf(d.self);
        setStaff(d.staff ?? []);
        setLoaded(true);
      });
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>User Settings</h2>
      <p style={subtleTextStyle}>
        Change your own login here. Changing a password signs that login out everywhere — you&apos;ll need the new one next time.
      </p>

      {!loaded && <p style={subtleTextStyle}>Loading…</p>}
      {self && <AccountRow account={self} label="Your login" onSaved={refresh} />}

      {staff.length > 0 && (
        <>
          <h3 style={{ marginBottom: 4 }}>Staff logins</h3>
          {staff.map((s) => (
            <AccountRow key={s.id} account={s} label={s.username} onSaved={refresh} />
          ))}
        </>
      )}
    </section>
  );
}
