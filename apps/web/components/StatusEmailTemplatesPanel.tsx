"use client";

import { useEffect, useState } from "react";

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
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>Gmail sender</span>
        <span className={sender.connected ? "lamp lamp-ok" : "lamp lamp-idle"}>
          {sender.connected ? "Connected" : "Not connected"}
        </span>
      </div>
      <div className="panel-body">
        {sender.connected && !editing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13 }}>
              Sending as <span className="data">{sender.gmailAddress}</span>
            </span>
            <button onClick={() => setEditing(true)} className="ghost sm">Change</button>
            <button onClick={disconnect} className="danger sm">Disconnect</button>
          </div>
        ) : (
          <>
            <p className="meta" style={{ marginTop: 0 }}>
              Connect using a Gmail App Password (no OAuth verification needed).
            </p>
            <div className="machine-block" style={{ marginBottom: 12 }}>
              <span className="instrument-label">Quick steps</span>
              <p className="meta" style={{ margin: "6px 0 0" }}>
                Open{" "}
                <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
                  Google App Passwords
                </a>{" "}
                → Enable 2-Step Verification if prompted → Select <strong>Mail</strong> +{" "}
                <strong>Other</strong> → Type <strong>AIVA</strong> → Generate → copy the 16-character
                password.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="field" style={{ flex: "1 1 180px", minWidth: 0 }}>
                <label className="field-label" htmlFor="aiva-status-email-gmail">Gmail address</label>
                <input
                  id="aiva-status-email-gmail"
                  type="email"
                  autoComplete="email"
                  placeholder="you@gmail.com"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: "1 1 180px", minWidth: 0 }}>
                <label className="field-label" htmlFor="aiva-status-email-password">App password</label>
                <input
                  id="aiva-status-email-password"
                  type="password"
                  autoComplete="off"
                  placeholder="16-character password"
                  value={passwordDraft}
                  onChange={(e) => setPasswordDraft(e.target.value)}
                />
              </div>
              <button
                onClick={save}
                disabled={saving || !emailDraft.trim() || !passwordDraft.trim()}
                className="primary sm"
              >
                {saving ? "Saving…" : "Connect"}
              </button>
              {editing && (
                <button onClick={() => setEditing(false)} className="ghost sm">Cancel</button>
              )}
            </div>
          </>
        )}
      </div>
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
      <div className="panel-sunk" style={{ padding: 14, marginBottom: 16 }}>
        <div className="panel-head" style={{ marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</span>
        </div>
        <div className="data" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          Placeholders: {placeholders.map((p) => `{{${p}}}`).join(", ")}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {statuses.map((s) => {
            const key = `${kind}:${s.value}`;
            const existing = templateFor(kind, s.value);
            const isOpen = openKey === key;
            const idBase = `aiva-status-email-${kind}-${s.value}`;

            return (
              <div
                key={key}
                style={{ background: "var(--panel)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", padding: 12 }}
              >
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
                      <label className="field-label" htmlFor={`${idBase}-subject`}>Subject</label>
                      <input
                        id={`${idBase}-subject`}
                        type="text"
                        placeholder="Email subject line"
                        value={subjectDraft}
                        onChange={(e) => setSubjectDraft(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={`${idBase}-body`}>Body (HTML)</label>
                      <textarea
                        id={`${idBase}-body`}
                        placeholder="Use {{placeholders}} for dynamic content"
                        value={bodyDraft}
                        onChange={(e) => setBodyDraft(e.target.value)}
                        rows={6}
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
                        disabled={saving || !subjectDraft.trim() || !bodyDraft.trim()}
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
          <span className="instrument-label">Email notifications</span>
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
        <span className="instrument-label">Email notifications</span>
      </div>
      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 16, maxWidth: "68ch" }}>
          Automated emails sent when order or repair status changes — sent through this business&apos;s
          own Gmail account below. Connect it first; a status change with no template set (or no
          connected Gmail account) is silently skipped.
        </p>
        <GmailSenderBox businessId={businessId} />
        {renderSection("order_status", ORDER_STATUSES, ORDER_PLACEHOLDERS, "Order status emails")}
        {renderSection("repair_status", REPAIR_STATUSES, REPAIR_PLACEHOLDERS, "Repair status emails")}
      </div>
    </section>
  );
}
