"use client";

import { useEffect, useMemo, useState } from "react";

import { cardStyle, subtleTextStyle, shortId, badgeStyle, type BadgeTone } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";

interface Invoice {
  id: string;
  businessId: string;
  contactId: string | null;
  invoiceNumber: string;
  status: string;
  currency: string;
  amountPaid: number;
  subtotal: number;
  total: number;
  balanceDue: number;
  dueDate: string | null;
  createdAt: string;
}

interface Contact {
  id: string;
  name: string;
}

const STATUSES = ["draft", "issued", "partially_paid", "paid", "overdue", "void"] as const;
const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", issued: "info", partially_paid: "warn", paid: "ok", overdue: "error", void: "neutral" };

/** Invoices generated off an accepted Quote (or created directly) —
 * recording a Payment here recomputes amountPaid/status server-side in
 * PaymentService.reconcileInvoice, so this list is always the source of
 * truth for what's actually still owed. */
export function InvoicesPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/revenue/invoices${qs}`)
      .then((r) => r.json())
      .then((d) => setInvoices(d.invoices));
    fetch(`/api/admin/crm/contacts${qs}`)
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts));
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active]);

  const contactName = useMemo(() => new Map((contacts ?? []).map((c) => [c.id, c.name])), [contacts]);

  const stats = useMemo(() => {
    if (!invoices) return null;
    const outstanding = invoices.reduce((sum, i) => sum + i.balanceDue, 0);
    const collected = invoices.reduce((sum, i) => sum + i.amountPaid, 0);
    return { outstanding, collected, count: invoices.length };
  }, [invoices]);

  async function setStatus(inv: Invoice, status: string) {
    setBusyId(inv.id);
    try {
      await fetch("/api/admin/revenue/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inv.id, status }),
      });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function recordPayment(inv: Invoice) {
    const amountStr = window.prompt(`Amount received for ${inv.invoiceNumber} (balance due: ${inv.currency}${inv.balanceDue.toLocaleString()})`, String(inv.balanceDue));
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!amount || amount <= 0) return;
    const method = window.prompt("Payment method (e.g. bKash, Nagad, bank transfer, cash)", "bank transfer");
    if (!method || !method.trim()) return;
    setBusyId(inv.id);
    try {
      await fetch("/api/admin/revenue/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: inv.businessId, invoiceId: inv.id, amount, method: method.trim() }),
      });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteInvoice(inv: Invoice) {
    const confirmed = window.confirm(`Delete invoice ${inv.invoiceNumber}? This cannot be undone.`);
    if (!confirmed) return;
    await fetch(`/api/admin/revenue/invoices?id=${encodeURIComponent(inv.id)}`, { method: "DELETE" });
    refresh();
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Invoices</h2>
      <p style={subtleTextStyle}>Billed amounts owed by a customer — generated from an accepted Quote, or record payments directly against one.</p>

      {stats && (
        <StatCardRow>
          <StatCard label="Invoices" value={String(stats.count)} tone="info" />
          <StatCard label="Collected" value={`৳${stats.collected.toLocaleString()}`} tone="success" />
          <StatCard label="Outstanding" value={`৳${stats.outstanding.toLocaleString()}`} tone={stats.outstanding > 0 ? "warning" : "success"} />
        </StatCardRow>
      )}

      {!invoices && <p style={subtleTextStyle}>Loading…</p>}
      {invoices && invoices.length === 0 && <p style={subtleTextStyle}>No invoices yet — generate one from an accepted Quote.</p>}

      {invoices && invoices.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Number</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Contact</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Total</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Paid</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Balance</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{inv.invoiceNumber}</td>
                  <td style={{ padding: "6px 8px" }}>{inv.contactId ? contactName.get(inv.contactId) ?? "—" : "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{inv.currency}{inv.total.toLocaleString()}</td>
                  <td style={{ padding: "6px 8px" }}>{inv.currency}{inv.amountPaid.toLocaleString()}</td>
                  <td style={{ padding: "6px 8px", color: inv.balanceDue > 0 ? "var(--danger)" : "var(--success)" }}>{inv.currency}{inv.balanceDue.toLocaleString()}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <select value={inv.status} onChange={(e) => setStatus(inv, e.target.value)} disabled={busyId === inv.id} style={{ padding: 4, fontSize: 11 }}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span style={{ marginLeft: 6, ...badgeStyle(STATUS_TONE[inv.status] ?? "neutral") }}>{inv.status}</span>
                  </td>
                  <td style={{ padding: "6px 8px", display: "flex", gap: 6 }}>
                    <button onClick={() => recordPayment(inv)} disabled={busyId === inv.id || inv.balanceDue <= 0} style={{ fontSize: 11, padding: "4px 8px" }}>Record Payment</button>
                    <button onClick={() => deleteInvoice(inv)} style={{ fontSize: 11, padding: "4px 6px" }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
