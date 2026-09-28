"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, labelTextStyle, inputStyle } from "./dashboard-styles";

interface ReviewConfig {
  businessId: string;
  googleReviewUrl: string;
  whatsAppReviewUrl: string;
  autoSend: boolean;
  triggerStatus: string;
  delayHours: number;
}

interface TemplatePreview {
  channel: "email" | "whatsapp";
  subject: string;
  body: string;
}

export function ReviewAutomationPanel({ businessId }: { businessId: string }) {
  const [config, setConfig] = useState<ReviewConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);

  function refresh() {
    fetch(`/api/admin/review-automation?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data) => setConfig(data.config ?? { businessId, googleReviewUrl: "", whatsAppReviewUrl: "", autoSend: false, triggerStatus: "completed", delayHours: 0 }))
      .catch(() => setConfig({ businessId, googleReviewUrl: "", whatsAppReviewUrl: "", autoSend: false, triggerStatus: "completed", delayHours: 0 }));
  }

  useEffect(() => { refresh(); }, [businessId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      await fetch("/api/admin/review-automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, googleReviewUrl: config.googleReviewUrl, whatsAppReviewUrl: config.whatsAppReviewUrl, autoSend: config.autoSend, triggerStatus: config.triggerStatus, delayHours: config.delayHours }),
      });
      refresh();
    } finally {
      setSaving(false);
    }
  }

  function updateConfig(field: keyof ReviewConfig, value: any) {
    setConfig((c) => c ? { ...c, [field]: value } : null);
  }

  async function testSend() {
    if (!config) return;
    const res = await fetch("/api/admin/review-automation/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, config }),
    });
    const data = await res.json();
    if (data.preview) setPreview(data.preview);
  }

  function Header() {
    return (
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Review Request Automation</h2>
        <p style={{ ...subtleTextStyle, fontSize: 13 }}>
          Auto-send review requests when a repair/order reaches a target status.
          Provide your Google Review link and/or a WhatsApp deep-link.
        </p>
      </div>
    );
  }

  function LinksCard() {
    return (
      <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Review Links</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelTextStyle}>Google Review URL</label>
            <input
              type="url"
              placeholder="https://g.page/yourbusiness/review"
              value={config?.googleReviewUrl ?? ""}
              onChange={(e) => updateConfig("googleReviewUrl", e.target.value)}
              style={inputStyle}
            />
            <p style={subtleTextStyle}>Get it from Google Business Profile → Get more reviews → Copy link</p>
          </div>
          <div>
            <label style={labelTextStyle}>WhatsApp Review URL (optional)</label>
            <input
              type="url"
              placeholder="https://wa.me/15551234567?text=Please%20review%20us..."
              value={config?.whatsAppReviewUrl ?? ""}
              onChange={(e) => updateConfig("whatsAppReviewUrl", e.target.value)}
              style={inputStyle}
            />
            <p style={subtleTextStyle}>Format: https://wa.me/PHONE?text=MESSAGE — customer clicks, message pre-filled</p>
          </div>
        </div>
      </div>
    );
  }

  function TriggerCard() {
    return (
      <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Trigger & Timing</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={labelTextStyle}>Trigger on status</label>
            <select value={config?.triggerStatus ?? "completed"} onChange={(e) => updateConfig("triggerStatus", e.target.value)} style={inputStyle}>
              <option value="completed">Completed</option>
              <option value="ready">Ready for Pickup</option>
              <option value="delivered">Delivered</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={labelTextStyle}>Delay (hours)</label>
            <input
              type="number"
              min="0"
              max="168"
              value={config?.delayHours ?? 0}
              onChange={(e) => updateConfig("delayHours", Number(e.target.value))}
              style={inputStyle}
            />
            <p style={subtleTextStyle}>0 = send immediately</p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={config?.autoSend ?? false} onChange={(e) => updateConfig("autoSend", e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
            Auto-send (no manual click)
          </label>
        </div>
      </div>
    );
  }

  function TemplateCard() {
    const emailBody = "Hi {{customerName}},<br><br>Thanks for choosing {{businessName}}! Your repair <strong>{{trackingToken}}</strong> is now complete.<br><br>Could you spare a minute to leave a review?<br><a href=\"{{reviewUrl}}\">{{reviewUrl}}</a><br><br>Thanks,<br>{{businessName}}";
    const whatsappBody = "Hi {{customerName}}! Your repair {{trackingToken}} is complete. 🙏 Please leave a quick review: {{reviewUrl}}";
    
    return (
      <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Message Templates</h3>
        <p style={{ ...subtleTextStyle, fontSize: 12, marginBottom: 12 }}>
          Placeholders: {"\u007B\u007BcustomerName\u007D\u007D"}, {"\u007B\u007BbusinessName\u007D\u007D"}, {"\u007B\u007BtrackingToken\u007D\u007D"}, {"\u007B\u007BreviewUrl\u007D\u007D"}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelTextStyle}>Email Subject</label>
            <input value="We'd love your feedback!" style={inputStyle} />
          </div>
          <div>
            <label style={labelTextStyle}>Email Body (HTML)</label>
            <textarea rows={4} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} defaultValue={emailBody} />
          </div>
          <div>
            <label style={labelTextStyle}>WhatsApp Body</label>
            <textarea rows={3} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} defaultValue={whatsappBody} />
          </div>
        </div>
      </div>
    );
  }

  function Actions() {
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={save} disabled={saving} style={primaryButtonStyle}> {saving ? "Saving…" : "Save Settings"} </button>
        <button onClick={testSend} style={{ ...primaryButtonStyle, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}> Test Send </button>
      </div>
    );
  }

  function PreviewCard() {
    if (!preview) return null;
    return (
      <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Test Preview</h4>
        <pre style={{ fontSize: 11, overflow: "auto", background: "var(--surface)", padding: 12, borderRadius: 4, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(preview, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div style={{ padding: 0 }}>
      <Header />
      <LinksCard />
      <TriggerCard />
      <TemplateCard />
      <Actions />
      <PreviewCard />
    </div>
  );
}