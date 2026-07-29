"use client";

import { useEffect, useState } from "react";

import { cardStyle, cellStyle } from "./dashboard-styles";

interface Credential {
  channel: string;
  label: string;
  appId: string;
  hasSecret: boolean;
  webhookVerifyToken: string;
}

/** One-time, platform-wide Meta App setup — required before any client
 * can OAuth-connect Messenger/Instagram from their own dashboard's
 * Integrations tab. WhatsApp's manual-entry flow only needs the webhook
 * verify token here (no App ID/Secret), so it's listed too. */
export function PlatformChannelAppsPanel() {
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [selected, setSelected] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function refresh() {
    fetch("/api/admin/channels/platform-app")
      .then((r) => r.json())
      .then((data) => setCredentials(data.credentials));
  }

  useEffect(refresh, []);

  useEffect(() => {
    const first = credentials?.[0];
    if (first && !selected) setSelected(first.channel);
  }, [credentials, selected]);

  const current = credentials?.find((c) => c.channel === selected);

  useEffect(() => {
    setAppId(current?.appId ?? "");
    setAppSecret("");
    setVerifyToken(current?.webhookVerifyToken ?? "");
  }, [current]);

  async function save() {
    if (!selected || !verifyToken.trim()) return;
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/channels/platform-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: selected, appId, appSecret, webhookVerifyToken: verifyToken }),
      });
      const result = await res.json();
      setMessage(res.ok ? `Saved "${result.saved}".` : `Error: ${result.error}`);
      if (res.ok) refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Integrations</h2>
      <p style={{ opacity: 0.6 }}>
        Platform-wide Meta App setup — a one-time step per channel, done
        here once, that unlocks the &quot;Connect&quot; button on every client&apos;s
        own dashboard. The App Secret is never sent back to this page once
        saved, only whether one is set. Webhook URL to enter in Meta&apos;s app
        dashboard: <code>{`{your deployed domain}`}/api/webhooks/{"{channel}"}</code>
      </p>

      {!credentials && <p>Loading…</p>}

      {credentials && (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle}>Channel</th>
                <th style={cellStyle}>App ID</th>
                <th style={cellStyle}>App Secret</th>
                <th style={cellStyle}>Webhook verify token</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((c) => (
                <tr key={c.channel}>
                  <td style={cellStyle}>{c.label}</td>
                  <td style={cellStyle}>{c.appId || "—"}</td>
                  <td style={cellStyle}>{c.hasSecret ? "✅ set" : "—"}</td>
                  <td style={cellStyle}>{c.webhookVerifyToken || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 24 }}>Edit</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ padding: 8 }}>
              {credentials.map((c) => (
                <option key={c.channel} value={c.channel}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              placeholder="App ID"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              style={{ padding: 8, flex: 1, minWidth: 140 }}
            />
            <input
              placeholder="App Secret (leave blank to keep current)"
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              style={{ padding: 8, flex: 1, minWidth: 200 }}
            />
            <input
              placeholder="Webhook verify token"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              style={{ padding: 8, flex: 1, minWidth: 160 }}
            />
            <button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {message && <p style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>{message}</p>}
        </>
      )}
    </section>
  );
}
