"use client";

import { useEffect, useState } from "react";

import { cardStyle, labelTextStyle, subtleTextStyle, inputStyle } from "./dashboard-styles";

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
    <div style={{ ...cardStyle, padding: 14, marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>WhatsApp sender</h3>
      {sender.connected && !editing ? (
        <>
          <p style={{ fontSize: 13 }}>🟢 Connected {sender.phoneNumberId ? `• ${sender.phoneNumberId}` : ""}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setEditing(true)} style={{ fontSize: 12, padding: "4px 10px" }}>Change</button>
            <button onClick={disconnect} style={{ fontSize: 12, padding: "4px 10px" }}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ ...subtleTextStyle, fontSize: 12, marginBottom: 8 }}>
            Connect your WhatsApp Business API (Meta Developer Portal → WhatsApp → API Setup).
          </p>
          <div style={{ background: "var(--surface)", borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 12, lineHeight: 1.6 }}>
            <strong>Quick steps:</strong> Go to{" "}
            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
              Meta Developer Portal
            </a>{" "}
            → Select app → WhatsApp → API Setup → Get Phone Number ID + Access Token.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <button onClick={() => setEditing(true)} style={{ fontSize: 12, padding: "6px 12px" }}>Configure</button>
          </div>
        </>
      )}
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
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{title}</h3>
        <p style={{ ...subtleTextStyle, fontSize: 12, marginBottom: 4 }}>
          WhatsApp template placeholders: {placeholders.join(", ")}
        </p>
        <p style={{ ...subtleTextStyle, fontSize: 11, marginBottom: 8, color: "var(--text-muted)" }}>
          Example mapping: {placeholders.map((p, i) => `${p} → ${examples[i] ?? ""}`).join(", ")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {statuses.map((s) => {
            const key = `${kind}:${s.value}`;
            const existing = templates?.find((t) => t.kind === kind && t.statusValue === s.value);
            const isOpen = openKey === key;

            return (
              <div key={key} style={{ ...cardStyle, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>{s.label}</strong>
                    {existing ? (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full, 9999px)",
                        background: existing.enabled ? "var(--success-subtle)" : "var(--surface-hover)",
                        color: existing.enabled ? "var(--success)" : "var(--text-muted)",
                      }}>
                        {existing.enabled ? "Enabled" : "Disabled"}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No template</span>
                    )}
                  </div>
                  <button onClick={() => toggle(kind, s.value)} className="ghost" style={{ fontSize: 12, padding: "6px 12px" }}>
                    {isOpen ? "Close" : existing ? "Edit" : "Add"}
                  </button>
                </div>

                {isOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
                    <div>
                      <label style={labelTextStyle}>Template Name (Meta dashboard)</label>
                      <input
                        type="text"
                        placeholder="e.g. repair_booked_notification"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelTextStyle}>Language</label>
                      <select value={languageDraft} onChange={(e) => setLanguageDraft(e.target.value)} style={inputStyle}>
                        <option value="en_US">English (US)</option>
                        <option value="bn">Bengali</option>
                        <option value="hi">Hindi</option>
                        <option value="es">Spanish</option>
                        <option value="ar">Arabic</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelTextStyle}>Header (optional)</label>
                      <input
                        type="text"
                        placeholder="Short header text"
                        value={headerDraft}
                        onChange={(e) => setHeaderDraft(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelTextStyle}>Body *</label>
                      <textarea
                        placeholder="Use {{1}}, {{2}}, etc. for variables"
                        value={bodyDraft}
                        onChange={(e) => setBodyDraft(e.target.value)}
                        rows={4}
                        style={{ ...inputStyle, fontFamily: "var(--font-mono)", resize: "vertical" }}
                      />
                    </div>
                    <div>
                      <label style={labelTextStyle}>Footer (optional)</label>
                      <input
                        type="text"
                        placeholder="Footer text"
                        value={footerDraft}
                        onChange={(e) => setFooterDraft(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelTextStyle}>Buttons (JSON array, optional)</label>
                      <textarea
                        placeholder='[{"type": "QUICK_REPLY", "text": "Track"}, {"type": "URL", "text": "View", "url": "https://example.com/track/{{1}}"}]'
                        value={buttonsDraft}
                        onChange={(e) => setButtonsDraft(e.target.value)}
                        rows={3}
                        style={{ ...inputStyle, fontFamily: "var(--font-mono)", resize: "vertical" }}
                      />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
                      <input type="checkbox" checked={enabledDraft} onChange={(e) => setEnabledDraft(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
                      Enabled
                    </label>
                    <div>
                      <button onClick={() => save(kind, s.value)} disabled={saving || !nameDraft.trim() || !bodyDraft.trim()} className="primary" style={{ fontSize: 13, padding: "8px 16px" }}>
                        {saving ? "Saving..." : "Save Template"}
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
      <div style={{ padding: 24, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginBottom: 8, opacity: 0.5 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <div style={{ fontSize: 13 }}>Loading templates...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>WhatsApp Status Templates</h2>
        <p style={{ ...subtleTextStyle, fontSize: 13 }}>
          WhatsApp template messages for automated status updates — sent through this business's
          WhatsApp Business API below. Connect it first; a status change with no template set (or no
          connected WhatsApp account) is silently skipped.
        </p>
      </div>
      <WhatsAppSenderBox businessId={businessId} />
      {renderSection("repair_status", REPAIR_STATUSES, WHATSAPP_PLACEHOLDERS, "Repair Status Templates")}
      {renderSection("order_status", ORDER_STATUSES, WHATSAPP_PLACEHOLDERS, "Order Status Templates")}
    </div>
  );
}