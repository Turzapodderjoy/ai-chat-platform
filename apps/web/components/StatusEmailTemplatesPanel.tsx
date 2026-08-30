"use client";

import { useEffect, useState } from "react";
import { cardStyle, labelTextStyle, subtleTextStyle, inputStyle } from "./dashboard-styles";

type Kind = "order_status" | "repair_status";

interface Template {
  id: string;
  businessId: string;
  kind: Kind;
  statusValue: string;
  subject: string;
  bodyHtml: string;
  enabled: boolean;
}

const ORDER_STATUSES: { value: string; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "picked_up", label: "Picked Up" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "returned", label: "Returned" },
];

const REPAIR_STATUSES: { value: string; label: string }[] = [
  { value: "booked", label: "Booked" },
  { value: "received", label: "Received" },
  { value: "in_repair", label: "In Repair" },
  { value: "ready", label: "Ready for Pickup" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const ORDER_PLACEHOLDERS = ["customerName", "statusLabel", "trackingId", "courier", "products"];
const REPAIR_PLACEHOLDERS = ["customerName", "statusLabel", "deviceType", "deviceModel", "trackingToken"];

interface GmailSender {
  gmailAddress: string | null;
  connected: boolean;
}

/** Gmail sender connect box -- an App Password, not OAuth: no Google
 * Cloud project, no platform-wide app credential, purely this one
 * business's own Google account. Google requires 2-Step Verification
 * turned on before an app password can be generated. */
function GmailSenderBox({ businessId }: { businessId: string }) {
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
      await fetch("/api/admin/gmail-sender-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, gmailAddress: emailDraft, appPassword: passwordDraft }),
      });
      setEditing(false);
      setEmailDraft("");
      setPasswordDraft("");
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    await fetch(`/api/admin/gmail-sender-config?businessId=${encodeURIComponent(businessId)}`, { method: "DELETE" });
    refresh();
  }

  if (!sender) return null;

  return (
    <div style={{ ...cardStyle, padding: 14, marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Gmail sender</h3>
      {sender.connected && !editing ? (
        <>
          <p style={{ fontSize: 13 }}>🟢 Sending as <strong>{sender.gmailAddress}</strong></p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setEditing(true)} style={{ fontSize: 12, padding: "4px 10px" }}>Change</button>
            <button onClick={disconnect} style={{ fontSize: 12, padding: "4px 10px" }}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ ...subtleTextStyle, fontSize: 12, marginBottom: 8 }}>
            Not OAuth — an App Password from this business&apos;s own Google account. Turn on
            2-Step Verification, then generate one at{" "}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
              myaccount.google.com/apppasswords
            </a>{" "}
            and paste it below.
          </p>
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
              {saving ? "Saving…" : "Save"}
            </button>
            {editing && (
              <button onClick={() => setEditing(false)} className="ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Cancel</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Editable per-status email templates ("the template box") for the
 * automated Order/Repair status-change emails -- sent through this
 * business's own Gmail account (App Password, see GmailSenderBox above),
 * not the paid Resend path EmailSenderConfig backs, and not shared with
 * any other client. Rendered server-side by StatusEmailService with
 * simple {{placeholder}} substitution, no template engine. */
export function StatusEmailTemplatesPanel({ businessId }: { businessId: string }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [enabledDraft, setEnabledDraft] = useState(true);
  const [saving, setSaving] = useState(false);

  function refresh() {
    fetch(`/api/admin/status-email-templates?businessId=${encodeURIComponent(businessId)}`)
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
    setSubjectDraft(existing?.subject ?? "");
    setBodyDraft(existing?.bodyHtml ?? "");
    setEnabledDraft(existing?.enabled ?? true);
  }

  async function save(kind: Kind, statusValue: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/status-email-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, kind, statusValue, subject: subjectDraft, bodyHtml: bodyDraft, enabled: enabledDraft }),
      });
      setOpenKey(null);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  function renderSection(kind: Kind, statuses: { value: string; label: string }[], placeholders: string[], title: string) {
    return (
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{title}</h3>
        <p style={{ ...subtleTextStyle, fontSize: 12, marginBottom: 4 }}>
          Placeholders: {placeholders.map((p) => `{{${p}}}`).join(", ")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {statuses.map((s) => {
            const key = `${kind}:${s.value}`;
            const existing = templateFor(kind, s.value);
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
                      <label style={labelTextStyle}>Subject</label>
                      <input
                        type="text"
                        placeholder="Email subject line"
                        value={subjectDraft}
                        onChange={(e) => setSubjectDraft(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelTextStyle}>Body (HTML)</label>
                      <textarea
                        placeholder="Use {{placeholders}} for dynamic content"
                        value={bodyDraft}
                        onChange={(e) => setBodyDraft(e.target.value)}
                        rows={6}
                        style={{ ...inputStyle, fontFamily: "var(--font-mono)", resize: "vertical" }}
                      />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
                      <input type="checkbox" checked={enabledDraft} onChange={(e) => setEnabledDraft(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
                      Enabled
                    </label>
                    <div>
                      <button onClick={() => save(kind, s.value)} disabled={saving || !subjectDraft.trim() || !bodyDraft.trim()} className="primary" style={{ fontSize: 13, padding: "8px 16px" }}>
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
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <div style={{ fontSize: 13 }}>Loading templates...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Email Notifications</h2>
        <p style={{ ...subtleTextStyle, fontSize: 13 }}>
          Automated emails sent when order or repair status changes — sent through this business's own
          Gmail account below. Connect it first; a status change with no template set (or no connected
          Gmail account) is silently skipped.
        </p>
      </div>
      <GmailSenderBox businessId={businessId} />
      {renderSection("order_status", ORDER_STATUSES, ORDER_PLACEHOLDERS, "Order Status Emails")}
      {renderSection("repair_status", REPAIR_STATUSES, REPAIR_PLACEHOLDERS, "Repair Status Emails")}
    </div>
  );
}
