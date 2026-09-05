"use client";

import { useEffect, useMemo, useState } from "react";

import { cardStyle, subtleTextStyle, shortId, badgeStyle, primaryButtonStyle, type BadgeTone } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";

interface Invoice {
  id: string;
  businessId: string;
  contactId: string | null;
  repairAppointmentId: string | null;
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
  phone: string | null;
  email: string | null;
}

interface RepairSummary {
  id: string;
  deviceType: string;
  deviceModel?: string;
  issueDescription: string;
}

interface DraftItem {
  name: string;
  quantity: string;
  unitPrice: string;
}

const STATUSES = ["draft", "issued", "partially_paid", "paid", "overdue", "void"] as const;
const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", issued: "info", partially_paid: "warn", paid: "ok", overdue: "error", void: "neutral" };
const EMPTY_ITEM: DraftItem = { name: "", quantity: "1", unitPrice: "" };

/** Invoices — generated automatically from a repair order (Order
 * Management's "Generate Invoice"), or added by hand here directly.
 * Manual line items are always freeform (name + price typed in), never
 * tied to an Inventory product — a business can bill for something
 * that isn't in stock. Recording a Payment recomputes amountPaid/
 * status server-side in PaymentService.reconcileInvoice, so this list
 * is always the source of truth for what's actually still owed. */
export function InvoicesPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [repairs, setRepairs] = useState<RepairSummary[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [draftContactId, setDraftContactId] = useState("");
  const [draftNewName, setDraftNewName] = useState("");
  const [draftNewPhone, setDraftNewPhone] = useState("");
  const [draftNewEmail, setDraftNewEmail] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);
  const [draftDiscount, setDraftDiscount] = useState("");
  const [draftTax, setDraftTax] = useState("");
  const [draftDueDate, setDraftDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  function refresh() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/revenue/invoices${qs}`)
      .then((r) => r.json())
      .then((d) => setInvoices(d.invoices));
    fetch(`/api/admin/crm/contacts${qs}`)
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts));
    if (businessId) {
      fetch(`/api/admin/repairs?businessId=${encodeURIComponent(businessId)}`)
        .then((r) => r.json())
        .then((d: { appointments: RepairSummary[] }) => setRepairs(d.appointments));
    }
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active]);

  const contactById = useMemo(() => new Map((contacts ?? []).map((c) => [c.id, c])), [contacts]);
  const repairById = useMemo(() => new Map(repairs.map((r) => [r.id, r])), [repairs]);

  const stats = useMemo(() => {
    if (!invoices) return null;
    const outstanding = invoices.reduce((sum, i) => sum + i.balanceDue, 0);
    const collected = invoices.reduce((sum, i) => sum + i.amountPaid, 0);
    return { outstanding, collected, count: invoices.length };
  }, [invoices]);

  function updateDraftItem(i: number, field: keyof DraftItem, value: string) {
    setDraftItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }

  function resetDraft() {
    setDraftContactId("");
    setDraftNewName("");
    setDraftNewPhone("");
    setDraftNewEmail("");
    setDraftItems([{ ...EMPTY_ITEM }]);
    setDraftDiscount("");
    setDraftTax("");
    setDraftDueDate("");
  }

  const validDraftItems = draftItems.filter((i) => i.name.trim() && Number(i.unitPrice) > 0);

  async function createInvoice() {
    if (!businessId || validDraftItems.length === 0) return;
    setSaving(true);
    try {
      // Typing a new customer's name always wins over the existing-
      // customer dropdown -- billing here was never meant to be limited
      // to people already in the Customer Database, so this creates
      // (or matches, by phone/email) a real Contact on the fly.
      let contactId = draftContactId || undefined;
      if (draftNewName.trim()) {
        const res = await fetch("/api/admin/crm/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, name: draftNewName.trim(), phone: draftNewPhone || undefined, email: draftNewEmail || undefined }),
        });
        const contact = await res.json();
        contactId = contact.id;
      }

      await fetch("/api/admin/revenue/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          contactId,
          items: validDraftItems.map((i) => ({ name: i.name.trim(), quantity: Number(i.quantity) || 1, unitPrice: Number(i.unitPrice) || 0 })),
          discount: draftDiscount ? Number(draftDiscount) : undefined,
          tax: draftTax ? Number(draftTax) : undefined,
          dueDate: draftDueDate || undefined,
        }),
      });
      resetDraft();
      setShowAdd(false);
      refresh();
    } finally {
      setSaving(false);
    }
  }

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
    setInvoices((prev) => prev?.filter((i) => i.id !== inv.id) ?? prev);
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Invoices</h2>
      <p style={subtleTextStyle}>Billed amounts owed by a customer — generated automatically from a repair order, or added by hand below.</p>

      {businessId && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowAdd((s) => !s)} style={primaryButtonStyle}>
            {showAdd ? "Cancel" : "+ Add Invoice"}
          </button>
        </div>
      )}

      {showAdd && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <select value={draftContactId} onChange={(e) => setDraftContactId(e.target.value)} disabled={!!draftNewName.trim()} style={{ padding: 8, minWidth: 200 }}>
              <option value="">Existing customer…</option>
              {(contacts ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
              ))}
            </select>
            <span style={{ color: "var(--text-faint)", fontSize: 12 }}>or</span>
            <input placeholder="New customer name" value={draftNewName} onChange={(e) => setDraftNewName(e.target.value)} style={{ padding: 8, minWidth: 150 }} />
            <input placeholder="Phone (optional)" value={draftNewPhone} onChange={(e) => setDraftNewPhone(e.target.value)} style={{ padding: 8, width: 130 }} />
            <input placeholder="Email (optional)" value={draftNewEmail} onChange={(e) => setDraftNewEmail(e.target.value)} style={{ padding: 8, width: 150 }} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input placeholder="Discount" type="number" value={draftDiscount} onChange={(e) => setDraftDiscount(e.target.value)} style={{ padding: 8, width: 100 }} />
            <input placeholder="Tax" type="number" value={draftTax} onChange={(e) => setDraftTax(e.target.value)} style={{ padding: 8, width: 100 }} />
            <input placeholder="Due date" type="date" value={draftDueDate} onChange={(e) => setDraftDueDate(e.target.value)} style={{ padding: 8 }} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 6 }}>
            Line items — type any name and price, no Inventory link required
          </div>
          {draftItems.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input placeholder="Item name" value={item.name} onChange={(e) => updateDraftItem(i, "name", e.target.value)} style={{ padding: 8, flex: 1, minWidth: 160 }} />
              <input placeholder="Qty" type="number" min={1} value={item.quantity} onChange={(e) => updateDraftItem(i, "quantity", e.target.value)} style={{ padding: 8, width: 70 }} />
              <input placeholder="Unit price" type="number" value={item.unitPrice} onChange={(e) => updateDraftItem(i, "unitPrice", e.target.value)} style={{ padding: 8, width: 100 }} />
              {draftItems.length > 1 && (
                <button onClick={() => setDraftItems((prev) => prev.filter((_, idx) => idx !== i))} style={{ fontSize: 11, padding: "4px 8px" }}>✕</button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <button onClick={() => setDraftItems((prev) => [...prev, { ...EMPTY_ITEM }])} style={{ fontSize: 12, padding: "6px 10px" }}>
              + Add item
            </button>
            <button onClick={createInvoice} disabled={saving || validDraftItems.length === 0} style={primaryButtonStyle}>
              {saving ? "Creating…" : "Create Invoice"}
            </button>
          </div>
        </div>
      )}

      {stats && (
        <StatCardRow>
          <StatCard label="Invoices" value={String(stats.count)} tone="info" />
          <StatCard label="Collected" value={`$${stats.collected.toLocaleString()}`} tone="success" />
          <StatCard label="Outstanding" value={`$${stats.outstanding.toLocaleString()}`} tone={stats.outstanding > 0 ? "warning" : "success"} />
        </StatCardRow>
      )}

      {!invoices && <p style={subtleTextStyle}>Loading…</p>}
      {invoices && invoices.length === 0 && <p style={subtleTextStyle}>No invoices yet — generate one from a repair order, or add one by hand above.</p>}

      {invoices && invoices.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Number</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Contact</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Device / Issue</th>
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
                  <td style={{ padding: "6px 8px", fontSize: 12 }}>
                    {inv.contactId && contactById.get(inv.contactId) ? (
                      <>
                        {contactById.get(inv.contactId)!.name}
                        <div style={{ color: "var(--text-faint)" }}>
                          {[contactById.get(inv.contactId)!.phone, contactById.get(inv.contactId)!.email].filter(Boolean).join(" · ")}
                        </div>
                      </>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: 12 }}>
                    {inv.repairAppointmentId && repairById.get(inv.repairAppointmentId) ? (
                      <>
                        {repairById.get(inv.repairAppointmentId)!.deviceType}
                        {repairById.get(inv.repairAppointmentId)!.deviceModel ? ` (${repairById.get(inv.repairAppointmentId)!.deviceModel})` : ""}
                        <div style={{ color: "var(--text-faint)" }}>{repairById.get(inv.repairAppointmentId)!.issueDescription}</div>
                      </>
                    ) : "—"}
                  </td>
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
