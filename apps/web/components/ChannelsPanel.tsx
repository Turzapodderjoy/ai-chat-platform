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
  oauthConnected: boolean;
  timezone: string;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "America/Argentina/Buenos_Aires",
];

/** Gmail sender connect box — App Password setup with timezone selector. */
function GmailSenderBox({ businessId, onMessage }: { businessId: string; onMessage: (msg: string) => void }) {
  const [sender, setSender] = useState<GmailSender | null>(null);
  const [editing, setEditing] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [timezoneDraft, setTimezoneDraft] = useState("America/New_York");

  function refresh() {
    fetch(`/api/admin/gmail-sender-config?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data: GmailSender) => {
        setSender(data);
        setTimezoneDraft(data.timezone || "America/New_York");
      });
  }

  useEffect(refresh, [businessId]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/gmail-sender-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, gmailAddress: emailDraft, appPassword: passwordDraft || undefined, timezone: timezoneDraft }),
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

  async function saveTimezone(tz: string) {
    setTimezoneDraft(tz);
    const res = await fetch("/api/admin/gmail-sender-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, gmailAddress: sender?.gmailAddress ?? "", timezone: tz }),
    });
    if (res.ok) {
      onMessage(`Timezone updated to ${tz}`);
      refresh();
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
      <h3 style={{ margin: "0 0 8px 0", fontSize: 16 }}>Email (Gmail)</h3>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 12 }}>
        Send automated status emails through your Gmail account.
      </p>
      
      {sender.connected && !editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13 }}>
              Sending as <strong>{sender.gmailAddress}</strong>
              {sender.oauthConnected && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.6 }}>(Google OAuth)</span>}
              {!sender.oauthConnected && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.6 }}>(App Password)</span>}
            </span>
            {!sender.oauthConnected && <button onClick={() => setEditing(true)} style={{ fontSize: 12, padding: "6px 12px" }}>Change</button>}
            <button onClick={disconnect} style={{ fontSize: 12, padding: "6px 12px" }}>Disconnect</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Email timezone:</label>
            <select
              value={timezoneDraft}
              onChange={(e) => saveTimezone(e.target.value)}
              style={{ ...inputStyle, width: "auto", minWidth: 200, fontSize: 12, padding: "5px 8px" }}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Step-by-step guide */}
          <div style={{ background: "var(--surface)", borderRadius: 8, padding: 14, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Quick Setup (2 minutes):</div>
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Go to <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Google Account Security</a></li>
              <li>Enable <strong>2-Step Verification</strong> (required for App Passwords)</li>
              <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>App Passwords</a></li>
              <li>Select <strong>Mail</strong> and <strong>Other (Custom name)</strong></li>
              <li>Type <strong>AIVA</strong> and click <strong>Generate</strong></li>
              <li>Copy the 16-character password (looks like: <code>abcd efgh ijkl mnop</code>)</li>
              <li>Paste it below with your Gmail address</li>
            </ol>
            <button
              onClick={() => window.open("https://myaccount.google.com/apppasswords", "_blank")}
              style={{
                marginTop: 10,
                padding: "8px 16px",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Open App Passwords Page
            </button>
          </div>

          {/* Input fields */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>Gmail Address</label>
              <input
                type="email"
                placeholder="you@gmail.com"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>App Password</label>
              <input
                type="password"
                placeholder="16-character password"
                value={passwordDraft}
                onChange={(e) => setPasswordDraft(e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>Timezone</label>
              <select
                value={timezoneDraft}
                onChange={(e) => setTimezoneDraft(e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <button
              onClick={save}
              disabled={saving || !emailDraft.trim() || !passwordDraft.trim()}
              className="primary"
              style={{ fontSize: 13, padding: "8px 20px", height: 38 }}
            >
              {saving ? "Saving..." : "Connect Gmail"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Per-client "Integrations" tab — connect your own website,
 * Facebook Messenger, Instagram, WhatsApp, and Email
 * to your AI chatbot, entirely from here. */
export function ChannelsPanel({ businessId }: { businessId: string }) {
  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [message, setMessage] = useState("");
  const [enabledIntegrations, setEnabledIntegrations] = useState<string[] | null>(null);

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
    fetch(`/api/admin/business-settings?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d) => setEnabledIntegrations(d.enabledIntegrations));
  }, [businessId]);

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

  // Filter integrations based on enabledIntegrations (null = all enabled)
  function isIntegrationEnabled(id: string): boolean {
    if (!enabledIntegrations) return true; // null = all enabled
    return enabledIntegrations.includes(id);
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Integrations</h2>
      <p style={{ opacity: 0.6 }}>
        Connect your website, Facebook Messenger,
        Instagram, WhatsApp, and Email to your AI chatbot.
      </p>

      {message && <p style={{ fontSize: 13, opacity: 0.8 }}>{message}</p>}

      {/* Email */}
      {isIntegrationEnabled("email") && <GmailSenderBox businessId={businessId} onMessage={setMessage} />}

      {/* Channel catalog */}
      {data.catalog.filter((entry) => isIntegrationEnabled(entry.id)).map((entry) => {
        const connection = connectionFor(entry.id);

        return (
          <div key={entry.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginTop: 16 }}>
            <h3 style={{ margin: 0 }}>{entry.label}</h3>

            {entry.id === "website" && (
              <>
                <p style={{ opacity: 0.6, fontSize: 13 }}>
                  Paste this snippet just before the closing <code>&lt;/body&gt;</code>{" "}
                  tag on your site — a chat button appears immediately,
                  no further setup needed.
                </p>
                <pre style={{ background: "var(--surface)", color: "#eee", padding: 12, borderRadius: 6, fontSize: 12, overflowX: "auto" }}>
                  {data.embedSnippet}
                </pre>
                <button onClick={copySnippet}>Copy snippet</button>

                <h3 style={{ marginTop: 20 }}>Customize the widget</h3>
                <p style={{ opacity: 0.6, fontSize: 13 }}>
                  Everything below is plug-and-play — change it any time and it goes live on your
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
                    Not configured yet — ask your administrator to set up the {entry.label}
                    integration first.
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
                      in Meta Business Suite for your WhatsApp Business number.
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
                  WhatsApp number, not your production one.
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
