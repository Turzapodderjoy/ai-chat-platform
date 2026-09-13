"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface InvoiceDetail {
  invoice: {
    invoiceNumber: string;
    status: string;
    issueDate: string;
    dueDate: string | null;
    items: { id: string; name: string; quantity: number; unitPrice: number }[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    amountPaid: number;
    balanceDue: number;
  };
  businessName: string;
  currencySymbol: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  deviceLabel: string | null;
}

/** A dedicated, standalone printable view -- opened in a new tab from
 * the Invoices panel's "Print" button, not part of the tabbed dashboard
 * shell. window.print() hands off to whatever the browser offers for
 * its print destination (a physical printer, or "Save as PDF"), so
 * there's no PDF-generation library needed on this path -- that's only
 * needed server-side for the separate "Send" action's email attachment. */
export default function InvoicePrintClient() {
  const params = useParams<{ businessId: string; invoiceId: string }>();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/revenue/invoices/${params.invoiceId}/detail`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setDetail)
      .catch(() => setError("Could not load this invoice."));
  }, [params.invoiceId]);

  if (error) return <p style={{ padding: 40, fontFamily: "sans-serif" }}>{error}</p>;
  if (!detail) return <p style={{ padding: 40, fontFamily: "sans-serif" }}>Loading…</p>;

  const { invoice, currencySymbol } = detail;
  const money = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const statusStyle = STATUS_STYLE[invoice.status] ?? DEFAULT_STATUS_STYLE;

  return (
    <div style={{ background: "#f4f5f7", minHeight: "100vh" }}>
      <style>{`
        /* This page renders inside the dashboard's dark theme by default
           (no scoped stylesheet of its own) -- an invoice printout must
           always be plain black-on-white regardless, on screen and on
           paper, so this forces it unconditionally rather than only
           inside @media print. */
        html, body { background: #f4f5f7 !important; }
        @media print {
          .no-print { display: none !important; }
          .invoice-sheet { box-shadow: none !important; }
          body { background: #fff !important; }
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px 6px; text-align: left; }
        thead th { border-bottom: 2px solid #1a1a1a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
        tbody tr { border-bottom: 1px solid #eee; }
        tbody tr:last-child { border-bottom: 2px solid #1a1a1a; }
      `}</style>

      <div className="no-print" style={{ maxWidth: 720, margin: "0 auto", padding: "24px 40px 0" }}>
        <button
          onClick={() => window.print()}
          style={{ padding: "10px 20px", fontSize: 14, fontWeight: 600, background: "#4f46e5", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="invoice-sheet" style={{ maxWidth: 720, margin: "24px auto", padding: 48, fontFamily: "Helvetica, Arial, sans-serif", color: "#111", background: "#fff", borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 24, borderBottom: "3px solid #1a1a1a", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, margin: 0, letterSpacing: "-0.01em" }}>{detail.businessName}</h1>
          <p style={{ margin: "6px 0 0", color: "#888", fontSize: 12, letterSpacing: "0.12em", fontWeight: 600 }}>INVOICE</p>
        </div>
        <div style={{ textAlign: "right", fontSize: 13 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{invoice.invoiceNumber}</div>
          <div style={{ color: "#666" }}>Issued {new Date(invoice.issueDate).toLocaleDateString()}</div>
          {invoice.dueDate && <div style={{ color: "#666" }}>Due {new Date(invoice.dueDate).toLocaleDateString()}</div>}
          <span style={{
            display: "inline-block",
            marginTop: 8,
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            background: statusStyle.bg,
            color: statusStyle.fg,
          }}>{invoice.status.replace(/_/g, " ")}</span>
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", marginBottom: 6 }}>Bill To</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{detail.customerName ?? "—"}</div>
        {detail.customerPhone && <div style={{ fontSize: 13, color: "#444", marginTop: 2 }}>{detail.customerPhone}</div>}
        {detail.customerEmail && <div style={{ fontSize: 13, color: "#444" }}>{detail.customerEmail}</div>}
        {detail.deviceLabel && <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>{detail.deviceLabel}</div>}
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: "right" }}>Qty</th>
            <th style={{ textAlign: "right" }}>Unit Price</th>
            <th style={{ textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td style={{ textAlign: "right", color: "#666" }}>{item.quantity}</td>
              <td style={{ textAlign: "right", color: "#666" }}>{money(item.unitPrice)}</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>{money(item.quantity * item.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
        <div style={{ width: 260, fontSize: 13 }}>
          <Row label="Subtotal" value={money(invoice.subtotal)} />
          {invoice.discount > 0 && <Row label="Discount" value={`-${money(invoice.discount)}`} />}
          {invoice.tax > 0 && <Row label="Tax" value={money(invoice.tax)} />}
          <Row label="Total" value={money(invoice.total)} bold />
          <Row label="Paid" value={money(invoice.amountPaid)} />
          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: invoice.balanceDue > 0 ? "#fff4ed" : "#f0faf4", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15 }}>
            <span>Balance Due</span>
            <span style={{ color: invoice.balanceDue > 0 ? "#b45309" : "#15803d" }}>{money(invoice.balanceDue)}</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

const DEFAULT_STATUS_STYLE = { bg: "#e0e7ff", fg: "#4338ca" };
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  paid: { bg: "#dcfce7", fg: "#15803d" },
  partially_paid: { bg: "#ffedd5", fg: "#c2410c" },
  overdue: { bg: "#fee2e2", fg: "#b91c1c" },
  void: { bg: "#f1f1f1", fg: "#666" },
  draft: { bg: "#f1f1f1", fg: "#666" },
};

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontWeight: bold ? 700 : 400, fontSize: bold ? 15 : 13, borderTop: bold ? "1px solid #ddd" : undefined, color: bold ? "#111" : "#555" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
