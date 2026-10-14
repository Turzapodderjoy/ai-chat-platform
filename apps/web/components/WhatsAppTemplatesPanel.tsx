"use client";

import { useEffect, useState } from "react";


type Kind = "repair_status" | "order_status" | "general";

interface Template {
  id: string;
  businessId: string;
  kind: Kind;
  statusValue: string;
  name: string;
  language: string;
  header?: string;
  body: string;
  footer?: string;
  buttons?: string;
  enabled: boolean;
}

const REPAIR_STATUSES: { value: string; label: string }[] = [
  { value: "booked", label: "Booked" },
  { value: "received", label: "Received" },
  { value: "in_repair", label: "In Repair" },
  { value: "ready", label: "Ready for Pickup" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const ORDER_STATUSES: { value: string; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "picked_up", label: "Picked Up" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "returned", label: "Returned" },
];

const WHATSAPP_PLACEHOLDERS = ["{{1}}", "{{2}}", "{{3}}", "{{4}}", "{{5}}"];
const PLACEHOLDER_EXAMPLES = {
  repair_status: ["Customer name", "Status", "Device type", "Tracking token", "Ready date"],
  order_status: ["Customer name", "Status", "Tracking ID", "Courier", "Products"],
  general: ["Variable 1", "Variable 2", "Variable 3", "Variable 4", "Variable 5"],
};

interface WhatsAppSender {
  connected: boolean;
  phoneNumberId?: string;
}

function WhatsAppSenderBox({ businessId }: { businessId: string }) {
  const [sender, setSender] = useState<WhatsAppSender | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  function refresh() {
    fetch(`/api/admin/whatsapp-sender-config?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data: WhatsAppSender) => setSender(data));
  }

  useEffect(refresh, [businessId]);

  async function save() {
    setSaving(true);
    try {
      // TODO: implement actual save
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    await fetch(`/api/admin/whatsapp-sender-config?businessId=${encodeURIComponent(businessId)}`, { method: "DELETE" });
    refresh();
  }

  if (!sender) return null;

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>WhatsApp sender</span>
        <span className={sender.connected ? "lamp lamp-ok" : "lamp lamp-idle"}>
          {sender.connected ? "Connected" : "Not connected"}
        </span>
      </div>
      <div className="panel-body">
        {sender.connected && !editing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {sender.phoneNumberId && (
              <span className="data" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                {sender.phoneNumberId}
              </span>
            )}
            <button onClick={() => setEditing(true)} className="ghost sm">Change</button>
            <button onClick={disconnect} className="danger sm">Disconnect</button>
          </div>
        ) : (
          <>
            <p className="meta" style={{ marginTop: 0 }}>
              Connect your WhatsApp Business API (Meta Developer Portal → WhatsApp → API Setup).
            </p>
            <div className="machine-block" style={{ marginBottom: 12 }}>
              <span className="instrument-label">Quick steps</span>
              <p className="meta" style={{ margin: "6px 0 0" }}>
                Open the{" "}
                <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">
                  Meta Developer Portal
                </a>{" "}
                → Select app → WhatsApp → API Setup → get Phone Number ID and Access Token.
              </p>
            </div>
            <button onClick={() => setEditing(true)} className="primary sm">Configure</button>
          </>
        )}
      </div>
    </div>
  );
}

export function WhatsAppTemplatesPanel({ businessId }: { businessId: string }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [languageDraft, setLanguageDraft] = useState("en_US");
  const [headerDraft, setHeaderDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [footerDraft, setFooterDraft] = useState("");
  const [buttonsDraft, setButtonsDraft] = useState("");
  const [enabledDraft, setEnabledDraft] = useState(true);
  const [saving, setSaving] = useState(false);

  function refresh() {
    fetch(`/api/admin/whatsapp-templates?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data: { templates: Template[] }) => setTemplates(data.templates));
  }

  useEffect(refresh, [businessId]);

  function templateFor(kind: Kind, statusValue: string): Template | undefined {
    return templates?.find((t) => t.kind === kind && t.statusValue === statusValue);
  }

  function toggle(kind: Kind, statusValue: string) {
    const key = `${kind}:${statusValue}`;
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    const existing = templateFor(kind, statusValue);
    setNameDraft(existing?.name ?? "");
    setLanguageDraft(existing?.language ?? "en_US");
    setHeaderDraft(existing?.header ?? "");
    setBodyDraft(existing?.body ?? "");
    setFooterDraft(existing?.footer ?? "");
    setButtonsDraft(existing?.buttons ?? "");
    setEnabledDraft(existing?.enabled ?? true);
  }

  async function save(kind: Kind, statusValue: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/whatsapp-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, kind, statusValue, name: nameDraft, language: languageDraft, header: headerDraft, body: bodyDraft, footer: footerDraft, buttons: buttonsDraft, enabled: enabledDraft }),
      });
      setOpenKey(null);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  function renderSection(kind: Kind, statuses: { value: string; label: string }[], placeholders: string[], title: string) {
    const examples = PLACEHOLDER_EXAMPLES[kind] ?? PLACEHOLDER_EXAMPLES.general;
    return (
      <div className="panel-sunk" style={{ padding: 14, marginBottom: 16 }}>
        <div className="panel-head" style={{ marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</span>
        </div>
        <div className="data" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          Placeholders: {placeholders.join(", ")}
        </div>
        <div className="data" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3 }}>
          Example mapping: {placeholders.map((p, i) => `${p} → ${examples[i] ?? ""}`).join(", ")}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {statuses.map((s) => {
            const key = `${kind}:${s.value}`;
            const existing = templates?.find((t) => t.kind === kind && t.statusValue === s.value);
            const isOpen = openKey === key;
            const idBase = `aiva-wa-${kind}-${s.value}`;

            return (
              <div key={key} style={{ background: "var(--panel)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13.5, color: "var(--ink)" }}>{s.label}</strong>
                    {existing ? (
                      <span className={existing.enabled ? "lamp lamp-ok" : "lamp lamp-idle"}>
                        {existing.enabled ? "Enabled" : "Disabled"}
                      </span>
                    ) : (
                      <span className="lamp lamp-idle">No template</span>
                    )}
                  </div>
                  <button onClick={() => toggle(kind, s.value)} className="ghost sm">
                    {isOpen ? "Close" : existing ? "Edit" : "Add"}
                  </button>
                </div>

                {isOpen && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: "1px solid var(--line-soft)",
                    }}
                  >
                    <div className="field">
                      <label className="field-label" htmlFor={`${idBase}-name`}>
                        Template name (Meta dashboard)
                      </label>
                      <input
                        id={`${idBase}-name`}
                        type="text"
                        placeholder="e.g. repair_booked_notification"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={`${idBase}-language`}>Language</label>
                      <select
                        id={`${idBase}-language`}
                        value={languageDraft}
                        onChange={(e) => setLanguageDraft(e.target.value)}
                      >
                        <option value="en_US">English (US)</option>
                        <option value="bn">Bengali</option>
                        <option value="hi">Hindi</option>
                        <option value="es">Spanish</option>
                        <option value="ar">Arabic</option>
                      </select>
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={`${idBase}-header`}>Header (optional)</label>
                      <input
                        id={`${idBase}-header`}
                        type="text"
                        placeholder="Short header text"
                        value={headerDraft}
                        onChange={(e) => setHeaderDraft(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={`${idBase}-body`}>Body</label>
                      <textarea
                        id={`${idBase}-body`}
                        placeholder="Use {{1}}, {{2}}, etc. for variables"
                        value={bodyDraft}
                        onChange={(e) => setBodyDraft(e.target.value)}
                        rows={4}
                        style={{ fontFamily: "var(--font-mono)", resize: "vertical" }}
                      />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={`${idBase}-footer`}>Footer (optional)</label>
                      <input
                        id={`${idBase}-footer`}
                        type="text"
                        placeholder="Footer text"
                        value={footerDraft}
                        onChange={(e) => setFooterDraft(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={`${idBase}-buttons`}>
                        Buttons (JSON array, optional)
                      </label>
                      <textarea
                        id={`${idBase}-buttons`}
                        placeholder='[{"type": "QUICK_REPLY", "text": "Track"}, {"type": "URL", "text": "View", "url": "https://example.com/track/{{1}}"}]'
                        value={buttonsDraft}
                        onChange={(e) => setButtonsDraft(e.target.value)}
                        rows={3}
                        style={{ fontFamily: "var(--font-mono)", resize: "vertical" }}
                      />
                    </div>
                    <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        id={`${idBase}-enabled`}
                        checked={enabledDraft}
                        onChange={(e) => setEnabledDraft(e.target.checked)}
                      />
                      <label className="field-label" htmlFor={`${idBase}-enabled`} style={{ margin: 0 }}>
                        Enabled
                      </label>
                    </div>
                    <div>
                      <button
                        onClick={() => save(kind, s.value)}
                        disabled={saving || !nameDraft.trim() || !bodyDraft.trim()}
                        className="primary sm"
                      >
                        {saving ? "Saving…" : "Save template"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!templates) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">WhatsApp status templates</span>
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

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">WhatsApp status templates</span>
      </div>
      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 16, maxWidth: "68ch" }}>
          WhatsApp template messages for automated status updates — sent through this business&apos;s
          WhatsApp Business API below. Connect it first; a status change with no template set (or no
          connected WhatsApp account) is silently skipped.
        </p>
        <WhatsAppSenderBox businessId={businessId} />
        {renderSection("repair_status", REPAIR_STATUSES, WHATSAPP_PLACEHOLDERS, "Repair status templates")}
        {renderSection("order_status", ORDER_STATUSES, WHATSAPP_PLACEHOLDERS, "Order status templates")}
      </div>
    </section>
  );
}