"use client";

import { useEffect, useState } from "react";
import { cardStyle, primaryButtonStyle, subtleTextStyle } from "./dashboard-styles";

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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="email"
              placeholder="Gmail address"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 14 }}
            />
            <input
              type="password"
              placeholder="App password (16 characters)"
              value={passwordDraft}
              onChange={(e) => setPasswordDraft(e.target.value)}
              style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 14 }}
            />
            <button onClick={save} disabled={saving || !emailDraft.trim() || !passwordDraft.trim()} style={primaryButtonStyle}>
              {saving ? "Saving…" : "Save"}
            </button>
            {editing && (
              <button onClick={() => setEditing(false)} style={{ fontSize: 12, padding: "6px 10px" }}>Cancel</button>
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
              <div key={key} style={{ ...cardStyle, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{s.label}</strong>
                    {existing ? (
                      <span style={{ marginLeft: 8, fontSize: 12, color: existing.enabled ? "#10b981" : "#6b7280" }}>
                        {existing.enabled ? "Enabled" : "Disabled"}
                      </span>
                    ) : (
                      <span style={{ marginLeft: 8, fontSize: 12, fontStyle: "italic", opacity: 0.6 }}>No template set</span>
                    )}
                  </div>
                  <button onClick={() => toggle(kind, s.value)} style={{ fontSize: 12, padding: "4px 10px" }}>
                    {isOpen ? "Close" : existing ? "Edit" : "Add"}
                  </button>
                </div>

                {isOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    <input
                      type="text"
                      placeholder="Subject"
                      value={subjectDraft}
                      onChange={(e) => setSubjectDraft(e.target.value)}
                      style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 14 }}
                    />
                    <textarea
                      placeholder="Email body (HTML) -- use {{placeholders}} above"
                      value={bodyDraft}
                      onChange={(e) => setBodyDraft(e.target.value)}
                      rows={6}
                      style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, fontFamily: "monospace" }}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={enabledDraft} onChange={(e) => setEnabledDraft(e.target.checked)} />
                      Enabled
                    </label>
                    <div>
                      <button onClick={() => save(kind, s.value)} disabled={saving || !subjectDraft.trim() || !bodyDraft.trim()} style={primaryButtonStyle}>
                        {saving ? "Saving…" : "Save"}
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

  if (!templates) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Notifications</h2>
      <p style={{ ...subtleTextStyle, marginBottom: 16 }}>
        Automated emails sent to the customer whenever an order or repair status changes — sent through
        this business's own Gmail account below. Connect it first; a status change with no template set
        (or no connected Gmail account) is silently skipped.
      </p>
      <GmailSenderBox businessId={businessId} />
      {renderSection("order_status", ORDER_STATUSES, ORDER_PLACEHOLDERS, "Order status emails")}
      {renderSection("repair_status", REPAIR_STATUSES, REPAIR_PLACEHOLDERS, "Repair status emails")}
    </div>
  );
}
