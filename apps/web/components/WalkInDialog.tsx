"use client";

import { useEffect, useState } from "react";

import { primaryButtonStyle, subtleTextStyle } from "./dashboard-styles";

interface StaffOption {
  id: string;
  name: string;
  active: boolean;
}

interface CreatedAppointment {
  id: string;
  trackingToken: string;
  serialNumber?: string;
}

const fieldStyle = { padding: 8, fontSize: 13, width: "100%", boxSizing: "border-box" } as const;
const labelStyle = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" } as const;

/** Dashboard popup (not a browser dialog) for a customer who walks in
 * without booking: the same details the website appointment form
 * collects, entered by staff, creating the same New-stage appointment
 * with its tracking code, contact, Inbox thread and order number.
 * Technician and priority are optional extras the customer form doesn't
 * have. */
export function WalkInDialog({
  businessId,
  staff,
  onClose,
  onCreated,
}: {
  businessId: string;
  staff: StaffOption[];
  onClose: () => void;
  onCreated: (appointment: CreatedAppointment) => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [deviceModel, setDeviceModel] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [wantsFreeDiagnosis, setWantsFreeDiagnosis] = useState(false);
  const [technicianId, setTechnicianId] = useState("");
  const [priority, setPriority] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const canSave = customerName.trim() && phone.trim() && deviceType.trim() && issueDescription.trim();

  async function submit() {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/repairs/walk-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, customerName, phone, email, deviceType, deviceModel, issueDescription, wantsFreeDiagnosis, technicianId, priority }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the walk-in.");
        return;
      }
      onCreated(data);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        role="dialog"
        aria-label="New walk-in"
        style={{ width: "100%", maxWidth: 520, maxHeight: "100%", overflowY: "auto", background: "var(--surface, #1a1a1f)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "0 16px 48px rgba(0,0,0,0.5)" }}
      >
        <h3 style={{ margin: "0 0 4px" }}>🚶 New walk-in</h3>
        <p style={{ ...subtleTextStyle, marginTop: 0 }}>
          Same details as the website appointment form. It&apos;s created in the <strong>New</strong> column, booked for right now.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>
            Customer name *
            <input style={fieldStyle} value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoFocus />
          </label>
          <label style={labelStyle}>
            Phone *
            <input style={fieldStyle} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            Email (optional — a booking confirmation is sent if given)
            <input style={fieldStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Device *
            <input style={fieldStyle} value={deviceType} onChange={(e) => setDeviceType(e.target.value)} placeholder="e.g. Apple iPhone" />
          </label>
          <label style={labelStyle}>
            Model
            <input style={fieldStyle} value={deviceModel} onChange={(e) => setDeviceModel(e.target.value)} placeholder="e.g. 14 Pro" />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            Issue *
            <textarea style={{ ...fieldStyle, minHeight: 72, resize: "vertical", fontFamily: "inherit" }} value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={wantsFreeDiagnosis} onChange={(e) => setWantsFreeDiagnosis(e.target.checked)} />
            Wants a free diagnosis
          </label>
          <label style={labelStyle}>
            Technician (optional)
            <select style={fieldStyle} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Priority (optional)
            <select style={fieldStyle} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Normal</option>
              <option value="low">Low</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
        </div>

        {error && <p style={{ color: "var(--danger, #e5484d)", fontSize: 12, margin: "12px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: "8px 14px", fontSize: 13 }}>Cancel</button>
          <button onClick={submit} disabled={!canSave || saving} style={{ ...primaryButtonStyle, fontSize: 13 }}>
            {saving ? "Creating…" : "Create walk-in"}
          </button>
        </div>
      </div>
    </div>
  );
}
