"use client";

import { useEffect, useState } from "react";


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
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 20, color: "var(--ink)" }}>Review request automation</h1>
          <p className="meta" style={{ margin: 0 }}>
            Auto-send review requests when a repair/order reaches a target status. Provide your Google
            Review link and/or a WhatsApp deep-link.
          </p>
        </div>
      </div>
    );
  }

  function LinksCard() {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">Review links</span>
        </div>
        <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="field">
            <span className="instrument-label">Google review URL</span>
            <input
              type="url"
              placeholder="https://g.page/yourbusiness/review"
              value={config?.googleReviewUrl ?? ""}
              onChange={(e) => updateConfig("googleReviewUrl", e.target.value)}
            />
            <span className="field-hint">
              Google Business Profile &rarr; Get more reviews &rarr; Copy link
            </span>
          </label>
          <label className="field">
            <span className="instrument-label">WhatsApp review URL</span>
            <input
              type="url"
              placeholder="https://wa.me/15551234567?text=Please%20review%20us..."
              value={config?.whatsAppReviewUrl ?? ""}
              onChange={(e) => updateConfig("whatsAppReviewUrl", e.target.value)}
            />
            <span className="field-hint">
              Format https://wa.me/PHONE?text=MESSAGE — customer clicks, message pre-filled
            </span>
          </label>
        </div>
      </section>
    );
  }

  function TriggerCard() {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">Trigger &amp; timing</span>
        </div>
        <div className="panel-body">
          <div className="toolbar" style={{ marginBottom: 0, alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              <span className="instrument-label">Trigger on status</span>
              <select value={config?.triggerStatus ?? "completed"} onChange={(e) => updateConfig("triggerStatus", e.target.value)}>
                <option value="completed">Completed</option>
                <option value="ready">Ready for pickup</option>
                <option value="delivered">Delivered</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="field" style={{ flex: 1, minWidth: 120 }}>
              <span className="instrument-label">Delay (hours)</span>
              <input
                type="number"
                min={0}
                max={168}
                value={config?.delayHours ?? 0}
                onChange={(e) => updateConfig("delayHours", Number(e.target.value))}
              />
              <span className="field-hint">0 sends immediately</span>
            </label>
            <label className="field" style={{ flex: "0 0 auto" }}>
              <span className="instrument-label">Delivery</span>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, height: 34, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config?.autoSend ?? false}
                  onChange={(e) => updateConfig("autoSend", e.target.checked)}
                />
                Auto-send, no manual click
              </label>
            </label>
          </div>
        </div>
      </section>
    );
  }

  function TemplateCard() {
    const emailBody = "Hi {{customerName}},<br><br>Thanks for choosing {{businessName}}! Your repair <strong>{{trackingToken}}</strong> is now complete.<br><br>Could you spare a minute to leave a review?<br><a href=\"{{reviewUrl}}\">{{reviewUrl}}</a><br><br>Thanks,<br>{{businessName}}";
    const whatsappBody =
      "Hi {{customerName}}! Your repair {{trackingToken}} is complete. Please leave a quick review: {{reviewUrl}}";

    return (
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">Message templates</span>
        </div>
        <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p className="meta" style={{ margin: 0, fontSize: 11.5 }}>
            Placeholders: {"{{customerName}}"}, {"{{businessName}}"}, {"{{trackingToken}}"}, {"{{reviewUrl}}"}
          </p>
          <label className="field">
            <span className="instrument-label">Email subject</span>
            <input value="We'd love your feedback!" readOnly />
          </label>
          <label className="field">
            <span className="instrument-label">Email body (HTML)</span>
            <textarea rows={4} defaultValue={emailBody} style={{ fontFamily: "var(--font-mono)" }} />
          </label>
          <label className="field">
            <span className="instrument-label">WhatsApp body</span>
            <textarea rows={3} defaultValue={whatsappBody} style={{ fontFamily: "var(--font-mono)" }} />
          </label>
        </div>
      </section>
    );
  }

  function Actions() {
    return (
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={save} disabled={saving} className="primary">
            {saving ? "Saving…" : "Save settings"}
          </button>
          <button onClick={testSend} className="ghost">Test send</button>
        </div>
      </div>
    );
  }

  function PreviewCard() {
    if (!preview) return null;
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">Test preview</span>
          <span className="lamp lamp-machine">{preview.channel}</span>
        </div>
        <div className="panel-body">
          <div className="machine-block">
            <pre style={{ margin: 0, fontSize: 11, overflow: "auto", whiteSpace: "pre-wrap" }}>
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div>
      <Header />
      <LinksCard />
      <TriggerCard />
      <TemplateCard />
      <Actions />
      <PreviewCard />
    </div>
  );
}