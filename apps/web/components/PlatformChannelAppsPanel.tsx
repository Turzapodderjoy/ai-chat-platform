"use client";

import { useEffect, useState } from "react";


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
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Platform integrations</span>
      </div>
      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0 }}>
          Platform-wide Meta App setup — a one-time step per channel, done here once, that
          unlocks the &quot;Connect&quot; button on every client&apos;s own dashboard. The App Secret
          is never sent back to this page once saved, only whether one is set. Webhook URL to enter
          in Meta&apos;s app dashboard:{" "}
          <code>{`{your deployed domain}`}/api/webhooks/{"{channel}"}</code>
        </p>

        {!credentials && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ height: 28 }} />
            <div className="skeleton" style={{ height: 28 }} />
          </div>
        )}

        {credentials && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Channel</th>
                    <th scope="col">App ID</th>
                    <th scope="col">App secret</th>
                    <th scope="col">Webhook verify token</th>
                  </tr>
                </thead>
                <tbody>
                  {credentials.map((c) => (
                    <tr key={c.channel}>
                      <td>
                        <span className="data" style={{ color: "var(--ink)" }}>{c.label}</span>
                      </td>
                      <td><span className="data">{c.appId || "—"}</span></td>
                      <td>
                        {c.hasSecret ? (
                          <span className="lamp lamp-ok">set</span>
                        ) : (
                          <span className="data">—</span>
                        )}
                      </td>
                      <td><span className="data">{c.webhookVerifyToken || "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="toolbar" style={{ marginTop: 18, marginBottom: 0, alignItems: "flex-end" }}>
              <label className="field" style={{ flex: "0 0 auto" }}>
                <span className="instrument-label">Channel</span>
                <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {credentials.map((c) => (
                    <option key={c.channel} value={c.channel}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ flex: 1, minWidth: 140 }}>
                <span className="instrument-label">App ID</span>
                <input
                  placeholder="App ID"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 200 }}>
                <span className="instrument-label">App secret</span>
                <input
                  placeholder="Leave blank to keep current"
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 160 }}>
                <span className="instrument-label">Webhook verify token</span>
                <input
                  placeholder="Verify token"
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                />
              </label>
              <button onClick={save} disabled={saving} className="primary">
                {saving ? "Saving…" : "Save credentials"}
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
          </>
        )}
      </div>
    </section>
  );
}