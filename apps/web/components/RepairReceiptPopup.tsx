"use client";

import { useEffect, useState } from "react";

import { OrderItemsEditor, orderTotal, type RepairOrder } from "./OrderManagementPanel";
import { useCurrencySymbol } from "../lib/currency";

export interface ReceiptAppointment {
  id: string;
  businessId: string;
  trackingToken: string;
  customerName: string;
  phone: string;
  email?: string;
  deviceType: string;
  deviceModel?: string;
  issueDescription: string;
  appointmentDate: string;
  status: string;
  serialNumber?: string;
  totalOverride?: number;
  items: { id: string; repairAppointmentId: string; productId?: string; kind: "part" | "service"; name: string; quantity: number; defaultPrice: number; overridePrice?: number; finalPrice: number }[];
}

const PRINTER_WIDTHS = ["80mm", "58mm"] as const;

function formatDateIso(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });
}

export interface ReceiptEdits {
  customerName: string;
  phone: string;
  email: string;
  deviceType: string;
  deviceModel: string;
  issueDescription: string;
  totalOverride: number | null;
}

/** Popup shown when a repair moves to "received": a live-edit print
 * preview (device sticker on top, customer receipt below) with an
 * embedded order editor. "Print" fires window.print() then confirms the
 * status change; confirming without printing skips the print; the close
 * button cancels. */
export function RepairReceiptPopup({
  appointment,
  products,
  businessName,
  onPrint,
  onNoNeedPrint,
  onClose,
  onItemsChanged,
}: {
  appointment: ReceiptAppointment;
  products: { id: string; name: string; price: string | null; stock: string | null }[];
  businessName: string;
  onPrint: (edits: ReceiptEdits) => void;
  onNoNeedPrint: (edits: ReceiptEdits) => void;
  onClose: () => void;
  onItemsChanged: () => void;
}) {
  const currency = useCurrencySymbol(appointment.businessId);
  const [width, setWidth] = useState<"80mm" | "58mm">(() => (localStorage.getItem("aiva_printer_width") as "80mm" | "58mm") ?? "80mm");
  useEffect(() => { localStorage.setItem("aiva_printer_width", width); }, [width]);

  // Live-edited receipt fields (override the repair when confirmed).
  const [customerName, setCustomerName] = useState(appointment.customerName);
  const [phone, setPhone] = useState(appointment.phone);
  const [email, setEmail] = useState(appointment.email ?? "");
  const [deviceType, setDeviceType] = useState(appointment.deviceType);
  const [deviceModel, setDeviceModel] = useState(appointment.deviceModel ?? "");
  const [issueDescription, setIssueDescription] = useState(appointment.issueDescription);
  const [totalOverride, setTotalOverride] = useState<string>(appointment.totalOverride != null ? String(appointment.totalOverride) : "");

  // Rebuild the order object so the shared editor re-derives totals from
  // the live-edited fields.
  const order: RepairOrder = {
    id: appointment.id,
    businessId: appointment.businessId,
    trackingToken: appointment.trackingToken,
    customerName,
    phone,
    email: email || undefined,
    deviceType,
    deviceModel: deviceModel || undefined,
    issueDescription,
    appointmentDate: appointment.appointmentDate,
    status: appointment.status,
    serialNumber: appointment.serialNumber,
    totalOverride: totalOverride.trim() ? Number(totalOverride) : undefined,
    items: appointment.items,
  };

  const total = orderTotal(order);
  const dateStr = formatDateIso(appointment.appointmentDate);
  const deviceLabel = `${deviceType}${deviceModel ? ` ${deviceModel}` : ""}`;

  const edits: ReceiptEdits = {
    customerName,
    phone,
    email,
    deviceType,
    deviceModel,
    issueDescription,
    totalOverride: totalOverride.trim() ? Number(totalOverride) : null,
  };

  const editableField = (id: string, label: string, value: string, onChange: (v: string) => void, numeric = false) => (
    <div className="field" style={{ flex: "1 1 160px", minWidth: 0 }}>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className={numeric ? "data" : undefined}
        type={numeric ? "number" : undefined}
        inputMode={numeric ? "decimal" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--ink) 55%, transparent)",
        backdropFilter: "blur(2px)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div className="panel" style={{ width: "min(1080px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-pop)" }}>
        <div className="panel-head" style={{ flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <span className="instrument-label">Mark received</span>
            <div className="meta">
              Print the device sticker and customer receipt, then mark this repair received. Edits below override the stored details.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ width: 140 }}>
              <label className="field-label" htmlFor="receipt-width">Printer width</label>
              <select id="receipt-width" value={width} onChange={(e) => setWidth(e.target.value as "80mm" | "58mm")}>
                {PRINTER_WIDTHS.map((w) => <option key={w} value={w}>{w} printer</option>)}
              </select>
            </div>
            <button type="button" className="primary sm" onClick={() => onPrint(edits)}>
              Print and mark received
            </button>
            <button type="button" className="sm" onClick={() => onNoNeedPrint(edits)}>
              Mark received without printing
            </button>
            <button type="button" className="ghost sm" onClick={onClose} aria-label="Close without marking received" title="Cancel">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="panel-body panel-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Left: editable fields + order items */}
          <div style={{ flex: "1 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div className="meta">Edits override this repair&apos;s details when you print or confirm.</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                {editableField("receipt-customer", "Customer name", customerName, setCustomerName)}
                {editableField("receipt-phone", "Phone", phone, setPhone)}
                {editableField("receipt-email", "Email", email, setEmail)}
                {editableField("receipt-device-type", "Device type", deviceType, setDeviceType)}
                {editableField("receipt-device-model", "Device model", deviceModel, setDeviceModel)}
                {editableField("receipt-issue", "Issue", issueDescription, setIssueDescription)}
                {editableField("receipt-override-total", "Override total", totalOverride, setTotalOverride, true)}
              </div>
            </div>

            {/* Order items (reuses the shared order editor) */}
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <div className="instrument-label" style={{ marginBottom: 2 }}>Order items</div>
              <div className="meta" style={{ marginBottom: 8 }}>
                Add parts and services with pricing. They appear on the receipt.
              </div>
              <OrderItemsEditor order={order} products={products} onChanged={onItemsChanged} />
            </div>
          </div>

          {/* Right: live print preview, pinned while the left scrolls. The
              sheet itself stays paper-white with monospace type: it is a
              preview of the printed artefact, not app chrome. */}
          <div
            style={{
              flex: "0 0 auto",
              background: "var(--panel-sunk)",
              border: "1px dashed var(--line-strong)",
              borderRadius: "var(--r-sm)",
              padding: 16,
              display: "flex",
              justifyContent: "center",
              overflowX: "auto",
              position: "sticky",
              top: 0,
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            <div className="no-print chrome" style={{ display: "none" }} />
            <div className="print-sheet" style={{ width, background: "#fff", color: "#111", fontFamily: "'Courier New', monospace", fontSize: 12, lineHeight: 1.45, padding: width === "58mm" ? "6mm" : "8mm", boxSizing: "border-box", boxShadow: "var(--shadow-pop)" }}>
              {/* Sticker (top, short) */}
              <div style={{ borderBottom: width === "58mm" ? "1px dashed #888" : "2px solid #111", paddingBottom: 6, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{businessName || "REPAIR SHOP"}</div>
                <div style={{ fontSize: 11, marginTop: 3 }}>Customer: <strong>{customerName}</strong></div>
                <div style={{ fontSize: 11 }}>Device: {deviceLabel}</div>
                <div style={{ fontSize: 11 }}>Tracking: <strong>{appointment.trackingToken}</strong></div>
                <div style={{ fontSize: 11 }}>Date: {dateStr}</div>
                {appointment.serialNumber && <div style={{ fontSize: 11 }}>Appt #: {appointment.serialNumber}</div>}
              </div>

              {/* Cut line */}
              <div style={{ textAlign: "center", color: "#888", fontSize: 10, margin: "2px 0 4px", letterSpacing: 2 }}>· · · cut here · · ·</div>

              {/* Receipt (bottom, longer) */}
              <div>
                <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{businessName || "REPAIR SHOP"}</div>
                <div style={{ fontWeight: 700, fontSize: 13, margin: "2px 0 6px" }}>CUSTOMER RECEIPT</div>
                <div>Customer: {customerName}</div>
                <div>Phone: {phone}</div>
                {email && <div>Email: {email}</div>}
                <div style={{ marginTop: 4 }}>Device: {deviceLabel}</div>
                <div>Issue: {issueDescription}</div>
                <div>Tracking: <strong>{appointment.trackingToken}</strong></div>
                <div>Date: {dateStr}</div>
                {appointment.serialNumber && <div>Appt #: {appointment.serialNumber}</div>}

                <div style={{ marginTop: 8, borderTop: "1px solid #555", borderBottom: "1px solid #555", padding: "4px 0" }}>
                  {appointment.items.length === 0 ? (
                    <div style={{ color: "#555" }}>No parts or services listed yet</div>
                  ) : (
                    appointment.items.map((it) => (
                      <div key={it.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span>{it.name} × {it.quantity}</span>
                        <span>{currency}{(it.overridePrice ?? it.defaultPrice * it.quantity).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: 4 }}>
                  <span>Total</span>
                  <span>{currency}{total.toFixed(2)}</span>
                </div>
                {totalOverride.trim() && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Override total</span>
                    <span>{currency}{Number(totalOverride).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ marginTop: 8, textAlign: "center" }}>
                  Track your repair: {appointment.trackingToken}
                </div>
                <div style={{ textAlign: "center", marginTop: 4 }}>Thank you!</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-sheet, .print-sheet * { visibility: visible !important; }
          .print-sheet { position: fixed !important; left: 0 !important; top: 0 !important; box-shadow: none !important; margin: 0 !important; }
          @page { size: auto; margin: 0; }
        }
      `}</style>
    </div>
  );
}