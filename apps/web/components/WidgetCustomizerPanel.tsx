"use client";

import { useEffect, useState } from "react";

import { primaryButtonStyle } from "./dashboard-styles";

interface WidgetConfig {
  businessId: string;
  accentColor: string;
  position: "bottom-right" | "bottom-left";
  theme: "light" | "dark";
  launcherText: string;
  headerText: string;
  greeting: string;
  avatarUrl: string | null;
  showBranding: boolean;
}

const FIELD_LABEL_STYLE = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 };
const FIELD_WRAP_STYLE = { minWidth: 180, flex: "1 1 180px" };

/** Every option here is a real column on WidgetConfig — nothing is
 * hardcoded per business. Saving writes straight to that row, and
 * widget.js reads it live on every page load, so the embed snippet
 * below never has to change when these are edited. */
export function WidgetCustomizerPanel({ businessId }: { businessId: string }) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [demoOpen, setDemoOpen] = useState(true);

  useEffect(() => {
    fetch(`/api/widget-config?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then(setConfig);
  }, [businessId]);

  function update<K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/widget-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          accentColor: config.accentColor,
          position: config.position,
          theme: config.theme,
          launcherText: config.launcherText,
          headerText: config.headerText,
          greeting: config.greeting,
          avatarUrl: config.avatarUrl || null,
          showBranding: config.showBranding,
        }),
      });
      const result = await res.json();
      setMessage(res.ok ? "Saved — live on the site immediately, no snippet change needed." : `Error: ${result.error}`);
      if (res.ok) setConfig(result);
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <p style={{ opacity: 0.6, fontSize: 13 }}>Loading widget settings…</p>;

  const dark = config.theme === "dark";
  const panelBg = dark ? "#161b22" : "#ffffff";
  const panelText = dark ? "#e6edf3" : "#111111";
  const bubbleBg = dark ? "#21262d" : "#f1f3f5";
  const justify = config.position === "bottom-left" ? "flex-start" : "flex-end";

  return (
    <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 320px", minWidth: 280 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={FIELD_WRAP_STYLE}>
            <label style={FIELD_LABEL_STYLE}>Accent color</label>
            <input type="color" value={config.accentColor} onChange={(e) => update("accentColor", e.target.value)} style={{ width: "100%", height: 34 }} />
          </div>
          <div style={FIELD_WRAP_STYLE}>
            <label style={FIELD_LABEL_STYLE}>Position</label>
            <select value={config.position} onChange={(e) => update("position", e.target.value as WidgetConfig["position"])} style={{ width: "100%" }}>
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
            </select>
          </div>
          <div style={FIELD_WRAP_STYLE}>
            <label style={FIELD_LABEL_STYLE}>Theme</label>
            <select value={config.theme} onChange={(e) => update("theme", e.target.value as WidgetConfig["theme"])} style={{ width: "100%" }}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div style={FIELD_WRAP_STYLE}>
            <label style={FIELD_LABEL_STYLE}>Launcher button text</label>
            <input value={config.launcherText} onChange={(e) => update("launcherText", e.target.value)} style={{ width: "100%" }} maxLength={24} />
          </div>
          <div style={FIELD_WRAP_STYLE}>
            <label style={FIELD_LABEL_STYLE}>Panel header text</label>
            <input value={config.headerText} onChange={(e) => update("headerText", e.target.value)} style={{ width: "100%" }} maxLength={40} />
          </div>
          <div style={{ ...FIELD_WRAP_STYLE, flexBasis: "100%" }}>
            <label style={FIELD_LABEL_STYLE}>Greeting (first message shown on open)</label>
            <input value={config.greeting} onChange={(e) => update("greeting", e.target.value)} style={{ width: "100%" }} maxLength={200} />
          </div>
          <div style={{ ...FIELD_WRAP_STYLE, flexBasis: "100%" }}>
            <label style={FIELD_LABEL_STYLE}>Avatar image URL (optional)</label>
            <input
              value={config.avatarUrl ?? ""}
              onChange={(e) => update("avatarUrl", e.target.value)}
              placeholder="https://…/logo.png"
              style={{ width: "100%" }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, flexBasis: "100%" }}>
            <input type="checkbox" checked={config.showBranding} onChange={(e) => update("showBranding", e.target.checked)} />
            Show &quot;Powered by AI Chat Platform&quot;
          </label>
        </div>

        <button onClick={save} disabled={saving} style={{ ...primaryButtonStyle, marginTop: 16 }}>
          {saving ? "Saving…" : "Save widget settings"}
        </button>
        {message && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>{message}</p>}
      </div>

      <div style={{ flex: "1 1 320px", minWidth: 300 }}>
        <label style={FIELD_LABEL_STYLE}>Live demo — exactly what visitors will see</label>
        <div
          style={{
            position: "relative",
            height: 420,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "repeating-linear-gradient(45deg, var(--surface) 0, var(--surface) 10px, var(--bg) 10px, var(--bg) 20px)",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: justify, padding: 16, gap: 10 }}>
            {demoOpen && (
              <div
                style={{
                  width: 260,
                  height: 300,
                  background: panelBg,
                  color: panelText,
                  borderRadius: 14,
                  boxShadow: "0 10px 30px rgba(0,0,0,.4)",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  border: `1px solid ${dark ? "#30363d" : "#e5e7eb"}`,
                }}
              >
                <div style={{ padding: "10px 12px", background: config.accentColor, color: "#fff", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                  {config.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={config.avatarUrl} alt="" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
                  )}
                  {config.headerText}
                </div>
                <div style={{ flex: 1, padding: 10, fontSize: 12 }}>
                  <div
                    style={{
                      display: "inline-block",
                      background: bubbleBg,
                      padding: "7px 10px",
                      borderRadius: 10,
                      maxWidth: "85%",
                    }}
                  >
                    {config.greeting}
                  </div>
                </div>
                <div style={{ display: "flex", borderTop: `1px solid ${dark ? "#30363d" : "#eee"}` }}>
                  <div style={{ flex: 1, padding: 8, fontSize: 12, color: "var(--text-faint)" }}>Ask something…</div>
                  <div style={{ padding: "8px 12px", background: config.accentColor, color: "#fff", fontSize: 12 }}>Send</div>
                </div>
                {config.showBranding && (
                  <div style={{ textAlign: "center", padding: 3, fontSize: 9, opacity: 0.5 }}>Powered by AI Chat Platform</div>
                )}
              </div>
            )}
            <button
              onClick={() => setDemoOpen((v) => !v)}
              style={{
                borderRadius: 999,
                border: "none",
                padding: "10px 18px",
                background: config.accentColor,
                color: "#fff",
                fontSize: 13,
                boxShadow: "0 4px 14px rgba(0,0,0,.3)",
              }}
            >
              {config.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={config.avatarUrl} alt="" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover", marginRight: 6, verticalAlign: -3 }} />
              )}
              {config.launcherText}
            </button>
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 6 }}>
          This preview is a static mock of the real widget — click the bubble to toggle it, same as on the live site.
        </p>
      </div>
    </div>
  );
}
