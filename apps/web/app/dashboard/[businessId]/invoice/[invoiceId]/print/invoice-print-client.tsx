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
    fetch(`/api/admin/revenue/invoices/${params.invoiceId}/detail`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setDetail)
      .catch(() => setError("Could not load this invoice."));
  }, [params.invoiceId]);

  if (error) return <p style={{ padding: 40, fontFamily: "sans-serif" }}>{error}</p>;
  if (!detail) return <p style={{ padding: 40, fontFamily: "sans-serif" }}>Loading…</p>;

  const { invoice, currencySymbol } = detail;
  const money = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 40, fontFamily: "Helvetica, Arial, sans-serif", color: "#111" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 4px; text-align: left; }
        thead th { border-bottom: 2px solid #ccc; font-size: 12px; text-transform: uppercase; color: #666; }
        tbody tr { border-bottom: 1px solid #eee; }
      `}</style>

      <div className="no-print" style={{ marginBottom: 24 }}>
        <button
          onClick={() => window.print()}
          style={{ padding: "10px 20px", fontSize: 14, fontWeight: 600, background: "#4f46e5", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          Print / Save as PDF
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, margin: 0 }}>{detail.businessName}</h1>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: 12, letterSpacing: "0.05em" }}>INVOICE</p>
        </div>
        <div style={{ textAlign: "right", fontSize: 13 }}>
          <div><strong>Invoice #</strong> {invoice.invoiceNumber}</div>
          <div><strong>Issued</strong> {new Date(invoice.issueDate).toLocaleDateString()}</div>
          {invoice.dueDate && <div><strong>Due</strong> {new Date(invoice.dueDate).toLocaleDateString()}</div>}
          <div style={{ marginTop: 4, textTransform: "uppercase", fontWeight: 700 }}>{invoice.status}</div>
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", color: "#666", marginBottom: 4 }}>Bill To</div>
        <div style={{ fontWeight: 600 }}>{detail.customerName ?? "—"}</div>
        {detail.customerPhone && <div style={{ fontSize: 13 }}>{detail.customerPhone}</div>}
        {detail.customerEmail && <div style={{ fontSize: 13 }}>{detail.customerEmail}</div>}
        {detail.deviceLabel && <div style={{ fontSize: 13, color: "#666" }}>{detail.deviceLabel}</div>}
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
              <td style={{ textAlign: "right" }}>{item.quantity}</td>
              <td style={{ textAlign: "right" }}>{money(item.unitPrice)}</td>
              <td style={{ textAlign: "right" }}>{money(item.quantity * item.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <div style={{ width: 240, fontSize: 13 }}>
          <Row label="Subtotal" value={money(invoice.subtotal)} />
          {invoice.discount > 0 && <Row label="Discount" value={`-${money(invoice.discount)}`} />}
          {invoice.tax > 0 && <Row label="Tax" value={money(invoice.tax)} />}
          <Row label="Total" value={money(invoice.total)} bold />
          <Row label="Paid" value={money(invoice.amountPaid)} />
          <Row label="Balance Due" value={money(invoice.balanceDue)} bold />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontWeight: bold ? 700 : 400, fontSize: bold ? 15 : 13, borderTop: bold ? "1px solid #ccc" : undefined }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
