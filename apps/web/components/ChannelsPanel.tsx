"use client";

import { useEffect, useState } from "react";

import { cardStyle } from "./dashboard-styles";
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

/** Per-client "Integrations" tab — connect the business's own website,
 * Facebook Messenger, Instagram, and WhatsApp to their AI chatbot,
 * entirely from here. Nothing here is hardcoded to a specific client:
 * the same panel, backed by CHANNEL_CATALOG, serves every business. */
export function ChannelsPanel({ businessId }: { businessId: string }) {
  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [message, setMessage] = useState("");

  const [waPhoneId, setWaPhoneId] = useState("");
  const [waToken, setWaToken] = useState("");
  const [waBusinessAccountId, setWaBusinessAccountId] = useState("");
  const [waSaving, setWaSaving] = useState(false);

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
        Instagram, and WhatsApp to their AI chatbot. Every message from
        any connected channel is answered by the exact same AI Brain and
        knowledge base as the Chat Demo tab.
      </p>

      {message && <p style={{ fontSize: 13, opacity: 0.8 }}>{message}</p>}

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

            {entry.id !== "website" && entry.id !== "whatsapp" && (
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
                    <button>Connect via Facebook</button>
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
          </div>
        );
      })}
    </section>
  );
}
