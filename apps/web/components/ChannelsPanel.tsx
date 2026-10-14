"use client";

import { useEffect, useState } from "react";

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
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>Email (Gmail)</span>
        <span className={sender.connected ? "lamp lamp-ok" : "lamp lamp-idle"}>
          {sender.connected ? "Connected" : "Not connected"}
        </span>
      </div>
      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0 }}>
          Send automated status emails through your Gmail account.
        </p>

        {sender.connected && !editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13 }}>
                Sending as <span className="data">{sender.gmailAddress}</span>
              </span>
              <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {sender.oauthConnected ? "Google OAuth" : "App Password"}
              </span>
              {!sender.oauthConnected && (
                <button onClick={() => setEditing(true)} className="ghost sm">Change</button>
              )}
              <button onClick={disconnect} className="danger sm">Disconnect</button>
            </div>
            <div className="field" style={{ maxWidth: 280 }}>
              <label className="field-label" htmlFor="aiva-gmail-tz">Email timezone</label>
              <select
                id="aiva-gmail-tz"
                value={timezoneDraft}
                onChange={(e) => saveTimezone(e.target.value)}
                style={{ fontSize: 12 }}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="machine-block">
              <span className="instrument-label">Quick setup</span>
              <ol style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.8, fontSize: 12.5, color: "var(--ink-2)" }}>
                <li>
                  Open <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">Google Account Security</a> and enable <strong>2-Step Verification</strong> (required for App Passwords)
                </li>
                <li>
                  Open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">App Passwords</a>
                </li>
                <li>Select <strong>Mail</strong> and <strong>Other (Custom name)</strong></li>
                <li>Type <strong>AIVA</strong> and click <strong>Generate</strong></li>
                <li>Copy the 16-character password (looks like <code>abcd efgh ijkl mnop</code>)</li>
                <li>Paste it below with your Gmail address</li>
              </ol>
              <button
                onClick={() => window.open("https://myaccount.google.com/apppasswords", "_blank")}
                className="ghost sm"
                style={{ marginTop: 10 }}
              >
                Open App Passwords page
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="field" style={{ flex: "1 1 200px", minWidth: 0 }}>
                <label className="field-label" htmlFor="aiva-gmail-address">Gmail address</label>
                <input
                  id="aiva-gmail-address"
                  type="email"
                  autoComplete="email"
                  placeholder="you@gmail.com"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: "1 1 200px", minWidth: 0 }}>
                <label className="field-label" htmlFor="aiva-gmail-app-password">App password</label>
                <input
                  id="aiva-gmail-app-password"
                  type="password"
                  autoComplete="off"
                  placeholder="16-character password"
                  value={passwordDraft}
                  onChange={(e) => setPasswordDraft(e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: "1 1 200px", minWidth: 0 }}>
                <label className="field-label" htmlFor="aiva-gmail-tz-setup">Timezone</label>
                <select
                  id="aiva-gmail-tz-setup"
                  value={timezoneDraft}
                  onChange={(e) => setTimezoneDraft(e.target.value)}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={save}
                disabled={saving || !emailDraft.trim() || !passwordDraft.trim()}
                className="primary sm"
              >
                {saving ? "Saving…" : "Connect Gmail"}
              </button>
            </div>
          </div>
        )}
      </div>
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
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">Integrations</span>
        </div>
        <div className="panel-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ height: 40 }} />
            <div className="skeleton" style={{ height: 40 }} />
            <div className="skeleton" style={{ height: 40 }} />
          </div>
        </div>
      </section>
    );
  }

  // Filter integrations based on enabledIntegrations (null = all enabled)
  function isIntegrationEnabled(id: string): boolean {
    if (!enabledIntegrations) return true; // null = all enabled
    return enabledIntegrations.includes(id);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Integrations</span>
        <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {data.connections.length} connected
        </span>
      </div>
      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 14, maxWidth: "68ch" }}>
          Connect your website, Facebook Messenger, Instagram, WhatsApp and Email to your AI chatbot.
        </p>

        {message && (
          <p className="meta" role="status" style={{ marginBottom: 12 }}>{message}</p>
        )}

        {isIntegrationEnabled("email") && <GmailSenderBox businessId={businessId} onMessage={setMessage} />}

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
          {data.catalog.filter((entry) => isIntegrationEnabled(entry.id)).map((entry) => {
            const connection = connectionFor(entry.id);

            return (
              <div key={entry.id} className="panel-sunk" style={{ padding: 14 }}>
                <div className="panel-head" style={{ marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{entry.label}</span>
                  <span className={connection ? "lamp lamp-ok" : "lamp lamp-idle"}>
                    {connection ? "Connected" : "Not connected"}
                  </span>
                </div>

                {entry.id === "website" && (
                  <>
                    <p className="meta">
                      Paste this snippet just before the closing <code>&lt;/body&gt;</code> tag on your
                      site — a chat button appears immediately, no further setup needed.
                    </p>
                    <pre className="machine-block" style={{ margin: 0 }}>{data.embedSnippet}</pre>
                    <button onClick={copySnippet} className="ghost sm" style={{ marginTop: 10 }}>
                      Copy snippet
                    </button>

                    <div style={{ marginTop: 18 }}>
                      <span className="instrument-label">Customize the widget</span>
                      <p className="meta">
                        Everything below is plug-and-play — change it any time and it goes live on your
                        site immediately. The embed snippet above never changes.
                      </p>
                      <WidgetCustomizerPanel businessId={businessId} />
                    </div>
                  </>
                )}

                {entry.id !== "website" && entry.id !== "whatsapp" && entry.id !== "whatsapp-test" && (
                  connection ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13 }}>
                        Connected as <span className="data">{connection.externalLabel}</span>
                      </span>
                      <button onClick={() => disconnect(entry.id)} className="danger sm">Disconnect</button>
                    </div>
                  ) : entry.supportsOAuth ? (
                    <a href={`/api/oauth/${entry.id}/start?businessId=${encodeURIComponent(businessId)}`}>
                      Connect {entry.label}
                    </a>
                  ) : (
                    <p className="meta">
                      Not configured yet — ask your administrator to set up the {entry.label} integration
                      first.
                    </p>
                  )
                )}

                {entry.id === "whatsapp" && (
                  connection ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13 }}>
                        Connected — phone number ID <span className="data">{connection.externalId}</span>
                      </span>
                      <button onClick={() => disconnect("whatsapp")} className="danger sm">Disconnect</button>
                    </div>
                  ) : (
                    <>
                      <p className="meta">
                        Paste the Phone Number ID and a permanent access token generated in Meta
                        Business Suite for your WhatsApp Business number.
                      </p>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div className="field" style={{ flex: "1 1 180px", minWidth: 0 }}>
                          <label className="field-label" htmlFor="aiva-wa-phone-id">Phone Number ID</label>
                          <input
                            id="aiva-wa-phone-id"
                            value={waPhoneId}
                            onChange={(e) => setWaPhoneId(e.target.value)}
                          />
                        </div>
                        <div className="field" style={{ flex: "1 1 180px", minWidth: 0 }}>
                          <label className="field-label" htmlFor="aiva-wa-token">Access token</label>
                          <input
                            id="aiva-wa-token"
                            type="password"
                            autoComplete="off"
                            value={waToken}
                            onChange={(e) => setWaToken(e.target.value)}
                          />
                        </div>
                        <div className="field" style={{ flex: "1 1 180px", minWidth: 0 }}>
                          <label className="field-label" htmlFor="aiva-wa-business-id">Business Account ID (optional)</label>
                          <input
                            id="aiva-wa-business-id"
                            value={waBusinessAccountId}
                            onChange={(e) => setWaBusinessAccountId(e.target.value)}
                          />
                        </div>
                        <button onClick={connectWhatsapp} disabled={waSaving} className="primary sm">
                          {waSaving ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </>
                  )
                )}

                {entry.id === "whatsapp-test" && (
                  <>
                    <div className="machine-block" style={{ marginBottom: 12 }}>
                      <span className="instrument-label">Ban risk — testing only</span>
                      <p className="meta" style={{ margin: "6px 0 0" }}>
                        Unofficial, testing-only — links via an Evolution API gateway instead of the
                        Meta Business API. Real ban risk on the linked number; use a disposable or
                        spare WhatsApp number, not your production one.
                      </p>
                    </div>
                    {connection ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13 }}>
                          Connected — <span className="data">{connection.externalLabel}</span>
                        </span>
                        <button onClick={() => disconnect("whatsapp-test")} className="danger sm">
                          Disconnect
                        </button>
                      </div>
                    ) : waTestQr ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
                        <p className="meta" style={{ margin: 0 }}>
                          Scan with WhatsApp → Linked devices → Link a device.
                        </p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={waTestQr} alt="WhatsApp QR code" width={220} height={220} />
                        <span
                          className={
                            waTestStatus === "ready"
                              ? "lamp lamp-ok"
                              : waTestStatus === "failed"
                                ? "lamp lamp-err"
                                : "lamp lamp-warn"
                          }
                        >
                          {waTestStatus ?? "waiting"}
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <button onClick={startTestWhatsappLink} disabled={waTestLoading} className="primary sm">
                          {waTestLoading ? "Starting…" : "Link WhatsApp (testing)"}
                        </button>
                        {waTestStatus && (
                          <span className={waTestStatus === "failed" ? "lamp lamp-err" : "lamp lamp-warn"}>
                            {waTestStatus}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
