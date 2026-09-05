"use client";

import { useEffect, useState } from "react";

import { cardStyle, inputStyle } from "./dashboard-styles";
import { WidgetCustomizerPanel } from "./WidgetCustomizerPanel";

interface CatalogEntry {
  id: string;
  label: string;
  requiresPlatformApp: boolean;
  supportsOAuth: boolean;
}

interface Connection {
  channel: string;
  externalId: string;
  externalLabel: string;
  updatedAt: string;
}

interface ChannelsResponse {
  catalog: CatalogEntry[];
  connections: Connection[];
  embedSnippet: string;
}

interface GmailSender {
  gmailAddress: string | null;
  connected: boolean;
}

interface GoogleSignInConfig {
  enabled: boolean;
  clientId: string | null;
}

/** Gmail sender connect box — App Password, not OAuth. */
function GmailSenderBox({ businessId, onMessage }: { businessId: string; onMessage: (msg: string) => void }) {
  const [sender, setSender] = useState<GmailSender | null>(null);
  const [editing, setEditing] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function refresh() {
    fetch(`/api/admin/gmail-sender-config?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data: GmailSender) => setSender(data));
  }

  useEffect(refresh, [businessId]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/gmail-sender-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, gmailAddress: emailDraft, appPassword: passwordDraft }),
      });
      if (res.ok) {
        setEditing(false);
        setEmailDraft("");
        setPasswordDraft("");
        onMessage("Gmail connected successfully.");
        refresh();
      } else {
        onMessage("Failed to connect Gmail. Check your credentials.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    await fetch(`/api/admin/gmail-sender-config?businessId=${encodeURIComponent(businessId)}`, { method: "DELETE" });
    onMessage("Gmail disconnected.");
    refresh();
  }

  if (!sender) return null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginTop: 16 }}>
      <h3 style={{ margin: "0 0 8px 0", fontSize: 16 }}>📧 Email (Gmail)</h3>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 12 }}>
        Send automated status emails through your Gmail account. Uses an App Password (not OAuth) — 
        enable 2-Step Verification, then generate one at{" "}
        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
          myaccount.google.com/apppasswords
        </a>
      </p>
      
      {sender.connected && !editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13 }}>🟢 Sending as <strong>{sender.gmailAddress}</strong></span>
          <button onClick={() => setEditing(true)} style={{ fontSize: 12, padding: "4px 10px" }}>Change</button>
          <button onClick={disconnect} style={{ fontSize: 12, padding: "4px 10px" }}>Disconnect</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input
            type="email"
            placeholder="Gmail address"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            style={{ ...inputStyle, width: 220 }}
          />
          <input
            type="password"
            placeholder="App password (16 characters)"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            style={{ ...inputStyle, width: 200 }}
          />
          <button onClick={save} disabled={saving || !emailDraft.trim() || !passwordDraft.trim()} className="primary" style={{ fontSize: 13, padding: "8px 16px" }}>
            {saving ? "Saving…" : "Connect"}
          </button>
          {editing && (
            <button onClick={() => setEditing(false)} className="ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Cancel</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Google Sign-In configuration for client logins. */
function GoogleSignInBox({ businessId, onMessage }: { businessId: string; onMessage: (msg: string) => void }) {
  const [config, setConfig] = useState<GoogleSignInConfig | null>(null);
  const [clientIdDraft, setClientIdDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function refresh() {
    fetch(`/api/admin/google-signin?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data: GoogleSignInConfig) => setConfig(data));
  }

  useEffect(refresh, [businessId]);

  async function save() {
    if (!clientIdDraft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/google-signin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, clientId: clientIdDraft, enabled: true }),
      });
      if (res.ok) {
        onMessage("Google Sign-In enabled.");
        setClientIdDraft("");
        refresh();
      } else {
        onMessage("Failed to save Google Sign-In config.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled() {
    if (!config) return;
    setSaving(true);
    try {
      await fetch("/api/admin/google-signin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, clientId: config.clientId, enabled: !config.enabled }),
      });
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    await fetch(`/api/admin/google-signin?businessId=${encodeURIComponent(businessId)}`, { method: "DELETE" });
    onMessage("Google Sign-In disabled.");
    refresh();
  }

  if (!config) return null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginTop: 16 }}>
      <h3 style={{ margin: "0 0 8px 0", fontSize: 16 }}>🔑 Google Sign-In</h3>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 12 }}>
        Let customers sign in with Google for seamless email integration and repair tracking.
        Create a OAuth 2.0 Client ID at{" "}
        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
          Google Cloud Console
        </a>
        {" "}with authorized redirect URI: <code>https://app.aiva-ai.net/api/oauth/google/callback</code>
      </p>
      
      {config.clientId ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13 }}>
            {config.enabled ? "🟢" : "⚪"} Client ID: <strong>{config.clientId}</strong>
          </span>
          <button onClick={toggleEnabled} disabled={saving} style={{ fontSize: 12, padding: "4px 10px" }}>
            {config.enabled ? "Disable" : "Enable"}
          </button>
          <button onClick={disconnect} style={{ fontSize: 12, padding: "4px 10px" }}>Remove</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input
            type="text"
            placeholder="Google OAuth Client ID"
            value={clientIdDraft}
            onChange={(e) => setClientIdDraft(e.target.value)}
            style={{ ...inputStyle, width: 400 }}
          />
          <button onClick={save} disabled={saving || !clientIdDraft.trim()} className="primary" style={{ fontSize: 13, padding: "8px 16px" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Per-client "Integrations" tab — connect the business's own website,
 * Facebook Messenger, Instagram, WhatsApp, Email, and Google Sign-In
 * to their AI chatbot, entirely from here. */
export function ChannelsPanel({ businessId }: { businessId: string }) {
  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [message, setMessage] = useState("");

  const [waPhoneId, setWaPhoneId] = useState("");
  const [waToken, setWaToken] = useState("");
  const [waBusinessAccountId, setWaBusinessAccountId] = useState("");
  const [waSaving, setWaSaving] = useState(false);

  const [waTestQr, setWaTestQr] = useState<string | null>(null);
  const [waTestStatus, setWaTestStatus] = useState<string | null>(null);
  const [waTestLoading, setWaTestLoading] = useState(false);

  function refresh() {
    fetch(`/api/admin/channels?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then(setData);
  }

  useEffect(refresh, [businessId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) setMessage(`Connected ${connected}.`);
    if (error) setMessage(`Error: ${error}`);
  }, []);

  function connectionFor(channel: string): Connection | undefined {
    return data?.connections.find((c) => c.channel === channel);
  }

  async function disconnect(channel: string) {
    await fetch("/api/admin/channels/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, channel }),
    });
    refresh();
  }

  async function connectWhatsapp() {
    if (!waPhoneId.trim() || !waToken.trim()) return;
    setWaSaving(true);
    try {
      const res = await fetch("/api/admin/channels/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          phoneNumberId: waPhoneId,
          accessToken: waToken,
          businessAccountId: waBusinessAccountId || undefined,
        }),
      });
      const result = await res.json();
      setMessage(res.ok ? "WhatsApp connected." : `Error: ${result.error}`);
      if (res.ok) {
        setWaPhoneId("");
        setWaToken("");
        setWaBusinessAccountId("");
        refresh();
      }
    } finally {
      setWaSaving(false);
    }
  }

  async function startTestWhatsappLink() {
    setWaTestLoading(true);
    setWaTestQr(null);
    setWaTestStatus(null);
    try {
      await fetch("/api/admin/channels/whatsapp-test/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      pollTestWhatsapp();
    } finally {
      setWaTestLoading(false);
    }
  }

  function pollTestWhatsapp() {
    const interval = setInterval(async () => {
      const [qrRes, statusRes] = await Promise.all([
        fetch(`/api/admin/channels/whatsapp-test/qr?businessId=${encodeURIComponent(businessId)}`).then((r) => r.json()),
        fetch(`/api/admin/channels/whatsapp-test/status?businessId=${encodeURIComponent(businessId)}`).then((r) => r.json()),
      ]);

      setWaTestStatus(statusRes.status ?? null);
      setWaTestQr(qrRes.qrCode ?? null);

      if (statusRes.status === "ready" || statusRes.status === "failed") {
        clearInterval(interval);
        if (statusRes.status === "ready") {
          setWaTestQr(null);
          setMessage("WhatsApp (testing) linked.");
          refresh();
        }
      }
    }, 3000);
  }

  function copySnippet() {
    if (data) {
      navigator.clipboard.writeText(data.embedSnippet);
      setMessage("Embed snippet copied to clipboard.");
    }
  }

  if (!data) {
    return (
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Integrations</h2>
        <p>Loading…</p>
      </section>
    );
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Integrations</h2>
      <p style={{ opacity: 0.6 }}>
        Connect this client&apos;s own website, Facebook Messenger,
        Instagram, WhatsApp, Email, and Google Sign-In to their AI chatbot.
      </p>

      {message && <p style={{ fontSize: 13, opacity: 0.8 }}>{message}</p>}

      {/* Email & Google Sign-In */}
      <GmailSenderBox businessId={businessId} onMessage={setMessage} />
      <GoogleSignInBox businessId={businessId} onMessage={setMessage} />

      {/* Channel catalog */}
      {data.catalog.map((entry) => {
        const connection = connectionFor(entry.id);

        return (
          <div key={entry.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginTop: 16 }}>
            <h3 style={{ margin: 0 }}>{entry.label}</h3>

            {entry.id === "website" && (
              <>
                <p style={{ opacity: 0.6, fontSize: 13 }}>
                  Paste this snippet just before the closing <code>&lt;/body&gt;</code>{" "}
                  tag on the client&apos;s site — a chat button appears immediately,
                  no further setup needed.
                </p>
                <pre style={{ background: "var(--surface)", color: "#eee", padding: 12, borderRadius: 6, fontSize: 12, overflowX: "auto" }}>
                  {data.embedSnippet}
                </pre>
                <button onClick={copySnippet}>Copy snippet</button>

                <h3 style={{ marginTop: 20 }}>Customize the widget</h3>
                <p style={{ opacity: 0.6, fontSize: 13 }}>
                  Everything below is plug-and-play — change it any time and it goes live on the client&apos;s
                  site immediately. The embed snippet above never changes.
                </p>
                <WidgetCustomizerPanel businessId={businessId} />
              </>
            )}

            {entry.id !== "website" && entry.id !== "whatsapp" && entry.id !== "whatsapp-test" && (
              <>
                {connection ? (
                  <>
                    <p style={{ fontSize: 13 }}>
                      🟢 Connected as <strong>{connection.externalLabel}</strong>
                    </p>
                    <button onClick={() => disconnect(entry.id)}>Disconnect</button>
                  </>
                ) : entry.supportsOAuth ? (
                  <a href={`/api/oauth/${entry.id}/start?businessId=${encodeURIComponent(businessId)}`}>
                    <button>Connect {entry.label}</button>
                  </a>
                ) : (
                  <p style={{ opacity: 0.6, fontSize: 13 }}>
                    Not configured on the platform yet — set up the {entry.label} app
                    credentials in the mother dashboard&apos;s Integrations tab first.
                  </p>
                )}
              </>
            )}

            {entry.id === "whatsapp" && (
              <>
                {connection ? (
                  <>
                    <p style={{ fontSize: 13 }}>
                      🟢 Connected — phone number ID <strong>{connection.externalId}</strong>
                    </p>
                    <button onClick={() => disconnect("whatsapp")}>Disconnect</button>
                  </>
                ) : (
                  <>
                    <p style={{ opacity: 0.6, fontSize: 13 }}>
                      Paste the Phone Number ID and a permanent access token generated
                      in Meta Business Suite for this client&apos;s WhatsApp Business number.
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input
                        placeholder="Phone Number ID"
                        value={waPhoneId}
                        onChange={(e) => setWaPhoneId(e.target.value)}
                        style={{ padding: 8, flex: 1, minWidth: 160 }}
                      />
                      <input
                        placeholder="Access token"
                        type="password"
                        value={waToken}
                        onChange={(e) => setWaToken(e.target.value)}
                        style={{ padding: 8, flex: 1, minWidth: 160 }}
                      />
                      <input
                        placeholder="Business Account ID (optional)"
                        value={waBusinessAccountId}
                        onChange={(e) => setWaBusinessAccountId(e.target.value)}
                        style={{ padding: 8, flex: 1, minWidth: 160 }}
                      />
                      <button onClick={connectWhatsapp} disabled={waSaving}>
                        {waSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            {entry.id === "whatsapp-test" && (
              <>
                <p style={{ opacity: 0.6, fontSize: 13 }}>
                  Unofficial, testing-only — links via an Evolution API gateway instead of the
                  Meta Business API. Real ban risk on the linked number; use a disposable/spare
                  WhatsApp number, not the client&apos;s production one.
                </p>
                {connection ? (
                  <>
                    <p style={{ fontSize: 13 }}>
                      🟢 Connected — <strong>{connection.externalLabel}</strong>
                    </p>
                    <button onClick={() => disconnect("whatsapp-test")}>Disconnect</button>
                  </>
                ) : waTestQr ? (
                  <>
                    <p style={{ fontSize: 13 }}>Scan with WhatsApp → Linked devices → Link a device.</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={waTestQr} alt="WhatsApp QR code" width={220} height={220} />
                    <p style={{ opacity: 0.6, fontSize: 12 }}>Status: {waTestStatus ?? "waiting…"}</p>
                  </>
                ) : (
                  <>
                    <button onClick={startTestWhatsappLink} disabled={waTestLoading}>
                      {waTestLoading ? "Starting…" : "Link WhatsApp (testing)"}
                    </button>
                    {waTestStatus && <p style={{ opacity: 0.6, fontSize: 12 }}>Status: {waTestStatus}</p>}
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
