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

/** Gmail sender connect box — "Sign in with Google" popup + App Password. */
function GmailSenderBox({ businessId, onMessage }: { businessId: string; onMessage: (msg: string) => void }) {
  const [sender, setSender] = useState<GmailSender | null>(null);
  const [editing, setEditing] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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

  function openGooglePopup() {
    setGoogleLoading(true);
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `/api/auth/google-email?businessId=${encodeURIComponent(businessId)}`,
      "google-email",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    function onGoogleMessage(e: MessageEvent) {
      if (e.data && typeof e.data === "object" && "success" in e.data) {
        window.removeEventListener("message", onGoogleMessage);
        setGoogleLoading(false);
        if (e.data.success && e.data.email) {
          setEmailDraft(e.data.email);
          onMessage("Email fetched from Google. Now enter your App Password below.");
        } else if (e.data.error) {
          onMessage(e.data.error);
        }
      }
    }

    window.addEventListener("message", onGoogleMessage);

    const checkPopup = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(checkPopup);
        window.removeEventListener("message", onGoogleMessage);
        setGoogleLoading(false);
      }
    }, 500);
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            onClick={openGooglePopup}
            disabled={googleLoading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "10px 16px",
              background: "#fff",
              color: "#1f2937",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "inherit",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleLoading ? "Signing in..." : "Sign in with Google"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 12, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>or enter manually</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

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
          </div>
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

      {/* Email */}
      <GmailSenderBox businessId={businessId} onMessage={setMessage} />

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
