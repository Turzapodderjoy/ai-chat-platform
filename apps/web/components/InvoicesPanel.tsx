"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, shortId, badgeStyle, primaryButtonStyle, type BadgeTone } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";
import { currencySymbol, useCurrencySymbol } from "../lib/currency";

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
  items: InvoiceItem[];
}

interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
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
  // Set when this line was picked from Inventory -- its cost then comes
  // live from Product.costPrice on the backend, never shown here.
  // Unset means a custom item, where costPrice below is staff-entered.
  productId?: string;
  costPrice?: string;
}

interface Product {
  id: string;
  name: string;
  price: string | null;
}

const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", issued: "info", partially_paid: "warn", paid: "ok", overdue: "error", void: "neutral" };
const EMPTY_ITEM: DraftItem = { name: "", quantity: "1", unitPrice: "" };

/** Invoices — generated automatically from a repair order (Order
 * Management's "Generate Invoice"), or added by hand here directly. A
 * manual line item can be picked straight from Inventory (its cost
 * then comes from Product.costPrice, silently -- never shown here, the
 * same way it's hidden on the Orders panel's own item picker) or typed
 * as a custom item, where staff can optionally enter its cost directly
 * so profit reporting still has a real basis for it. Either way, only
 * the sell price (unitPrice) ever reaches the customer-facing
 * print/PDF invoice. Recording a Payment recomputes amountPaid/
 * status server-side in PaymentService.reconcileInvoice, so this list
 * is always the source of truth for what's actually still owed. */
export function InvoicesPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const currency = useCurrencySymbol(businessId ?? "");
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [repairs, setRepairs] = useState<RepairSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
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
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // Edit invoice state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContactId, setEditContactId] = useState("");
  const [editItems, setEditItems] = useState<DraftItem[]>([]);
  const [editDiscount, setEditDiscount] = useState("");
  const [editTax, setEditTax] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  function refresh() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    let mounted = true;
    fetch(`/api/admin/revenue/invoices${qs}`)
      .then((r) => r.json())
      .then((d) => { if (mounted) setInvoices(d.invoices); });
    fetch(`/api/admin/crm/contacts${qs}`)
      .then((r) => r.json())
      .then((d) => { if (mounted) setContacts(d.contacts); });
    if (businessId) {
      fetch(`/api/admin/repairs?businessId=${encodeURIComponent(businessId)}`)
        .then((r) => r.json())
        .then((d: { appointments: RepairSummary[] }) => { if (mounted) setRepairs(d.appointments); });
      fetch(`/api/admin/products?businessId=${encodeURIComponent(businessId)}&limit=200`)
        .then((r) => r.json())
        .then((d: { products: Product[] }) => { if (mounted) setProducts(d.products); });
    }
    return () => { mounted = false; };
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active]);

  const contactById = useMemo(() => new Map((contacts ?? []).map((c) => [c.id, c])), [contacts]);
  const repairById = useMemo(() => new Map(repairs.map((r) => [r.id, r])), [repairs]);

  const sortedInvoices = useMemo(() => {
    if (!invoices) return null;
    return [...invoices].sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
  }, [invoices, sortOrder]);

  const stats = useMemo(() => {
    if (!invoices) return null;
    const outstanding = invoices.reduce((sum, i) => sum + i.balanceDue, 0);
    const collected = invoices.reduce((sum, i) => sum + i.amountPaid, 0);
    return { outstanding, collected, count: invoices.length };
  }, [invoices]);

  function updateDraftItem(i: number, field: keyof DraftItem, value: string) {
    setDraftItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }

  function updateEditItem(i: number, field: keyof DraftItem, value: string) {
    setEditItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }

  // Picking a real Inventory product auto-fills name + sell price and
  // carries productId along (cost then comes from Product.costPrice on
  // the backend); picking "Custom item" clears productId back to a
  // plain typed-in row, with an optional visible cost input of its own.
  function pickItemProduct(setter: typeof setDraftItems, i: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    setter((prev) =>
      prev.map((item, idx) =>
        idx === i
          ? { ...item, productId: productId || undefined, name: p?.name ?? item.name, unitPrice: p?.price ?? item.unitPrice, costPrice: productId ? undefined : item.costPrice }
          : item
      )
    );
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
  const validEditItems = editItems.filter((i) => i.name.trim() && Number(i.unitPrice) > 0);

  async function createInvoice() {
    if (!businessId || validDraftItems.length === 0) return;
    setSaving(true);
    try {
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
          items: validDraftItems.map((i) => ({ name: i.name.trim(), quantity: Number(i.quantity) || 1, unitPrice: Number(i.unitPrice) || 0, productId: i.productId, costPrice: i.costPrice ? Number(i.costPrice) : undefined })),
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

  async function startEdit(inv: Invoice) {
    // Fetch full invoice with items
    const res = await fetch(`/api/admin/revenue/invoices?id=${encodeURIComponent(inv.id)}`);
    const full = await res.json();
    if (full.invoice) {
      setEditingId(inv.id);
      setEditContactId(full.invoice.contactId || "");
      setEditItems(full.invoice.items.map((i: InvoiceItem) => ({ name: i.name, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })));
      setEditDiscount(String(full.invoice.discount ?? ""));
      setEditTax(String(full.invoice.tax ?? ""));
      setEditDueDate(full.invoice.dueDate ? full.invoice.dueDate.slice(0, 10) : "");
    }
  }

  async function saveEdit(inv: Invoice) {
    if (!businessId || validEditItems.length === 0) return;
    setEditSaving(true);
    try {
      await fetch("/api/admin/revenue/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: inv.id,
          contactId: editContactId || null,
          items: validEditItems.map((i) => ({ name: i.name.trim(), quantity: Number(i.quantity) || 1, unitPrice: Number(i.unitPrice) || 0, productId: i.productId, costPrice: i.costPrice ? Number(i.costPrice) : undefined })),
          discount: editDiscount ? Number(editDiscount) : undefined,
          tax: editTax ? Number(editTax) : undefined,
          dueDate: editDueDate || null,
        }),
      });
      setEditingId(null);
      refresh();
    } finally {
      setEditSaving(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function submitPayment(inv: Invoice, amount: number) {
    setBusyId(inv.id);
    try {
      const res = await fetch("/api/admin/revenue/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: inv.businessId, invoiceId: inv.id, amount }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        alert(err.error ?? "Failed to record payment");
        return;
      }
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function recordPayment(inv: Invoice) {
    const amountStr = window.prompt(`Amount collected for ${inv.invoiceNumber} — this becomes the invoice's total (fully paid if it covers the balance, partially paid otherwise)`, String(inv.balanceDue > 0 ? inv.balanceDue : inv.total));
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!amount || amount <= 0) return;
    await submitPayment(inv, amount);
  }

  async function recordFullPayment(inv: Invoice) {
    const amountStr = window.prompt(`How much has been paid in total for ${inv.invoiceNumber}? This overrides the invoice's total and marks it fully paid.`, String(inv.total));
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!amount || amount <= 0) return;
    await submitPayment(inv, amount);
  }

  function printInvoice(inv: Invoice) {
    window.open(`/dashboard/${inv.businessId}/invoice/${inv.id}/print`, "_blank");
  }

  async function sendInvoice(inv: Invoice) {
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/admin/revenue/invoices/${inv.id}/send`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "Failed to send invoice");
        return;
      }
      alert(`Invoice ${inv.invoiceNumber} sent.`);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteInvoice(inv: Invoice) {
    const confirmed = window.confirm(`Delete invoice ${inv.invoiceNumber}? This cannot be undone.`);
    if (!confirmed) return;
    const res = await fetch(`/api/admin/revenue/invoices?id=${encodeURIComponent(inv.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      alert(err.error ?? "Failed to delete invoice");
      return;
    }
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
            <select value={draftContactId} onChange={(e) => setDraftContactId(e.target.value)} disabled={!!draftNewName.trim()} style={{ padding: 8, minWidth: 0, flex: "1 1 180px" }}>
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
            Line items — pick from Inventory, or type a custom item
          </div>
          {draftItems.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
              <select value={item.productId ?? ""} onChange={(e) => pickItemProduct(setDraftItems, i, e.target.value)} style={{ padding: 8, minWidth: 150 }}>
                <option value="">Custom item</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.price ? ` (${currency}${p.price})` : ""}</option>
                ))}
              </select>
              <input placeholder="Item name" value={item.name} onChange={(e) => updateDraftItem(i, "name", e.target.value)} style={{ padding: 8, flex: "1 1 140px", minWidth: 0 }} />
              <input placeholder="Qty" type="number" min={1} value={item.quantity} onChange={(e) => updateDraftItem(i, "quantity", e.target.value)} style={{ padding: 8, width: 70, flex: "0 0 70px" }} />
              <input placeholder="Sell price" type="number" value={item.unitPrice} onChange={(e) => updateDraftItem(i, "unitPrice", e.target.value)} style={{ padding: 8, width: 100 }} />
              {!item.productId && (
                <input
                  placeholder="Cost price (optional)"
                  type="number"
                  value={item.costPrice ?? ""}
                  onChange={(e) => updateDraftItem(i, "costPrice", e.target.value)}
                  title="What this actually costs the business -- used for profit reporting, never shown to the customer."
                  style={{ padding: 8, width: 130 }}
                />
              )}
              {draftItems.length > 1 && (
                <button onClick={() => setDraftItems((prev) => prev.filter((_, idx) => idx !== i))} style={{ fontSize: 11, padding: "6px 12px" }}>✕</button>
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
          <StatCard label="Collected" value={`${currency}${stats.collected.toLocaleString()}`} tone="success" />
          <StatCard label="Outstanding" value={`${currency}${stats.outstanding.toLocaleString()}`} tone={stats.outstanding > 0 ? "warning" : "success"} />
        </StatCardRow>
      )}

      {!invoices && <p style={subtleTextStyle}>Loading…</p>}
      {invoices && invoices.length === 0 && <p style={subtleTextStyle}>No invoices yet — generate one from a repair order, or add one by hand above.</p>}

      {invoices && invoices.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", margin: "8px 0" }}>
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")} style={{ padding: 8, fontSize: 12 }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      )}

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
                <Fragment key={inv.id}>
                  <tr>
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
                    <td style={{ padding: "6px 8px" }}>{currency}{inv.total.toLocaleString()}</td>
                    <td style={{ padding: "6px 8px" }}>{currency}{inv.amountPaid.toLocaleString()}</td>
                    <td style={{ padding: "6px 8px", color: inv.balanceDue > 0 ? "var(--danger)" : "var(--success)" }}>{currency}{inv.balanceDue.toLocaleString()}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={badgeStyle(STATUS_TONE[inv.status] ?? "neutral")}>{inv.status}</span>
                    </td>
                    <td style={{ padding: "6px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => recordPayment(inv)} disabled={busyId === inv.id} style={{ fontSize: 11, padding: "6px 12px" }}>Paid</button>
                      {inv.status === "partially_paid" && (
                        <button onClick={() => recordFullPayment(inv)} disabled={busyId === inv.id} style={{ fontSize: 11, padding: "6px 12px" }}>Fully Paid</button>
                      )}
                      <button onClick={() => printInvoice(inv)} style={{ fontSize: 11, padding: "6px 12px" }}>Print</button>
                      <button onClick={() => sendInvoice(inv)} disabled={busyId === inv.id} style={{ fontSize: 11, padding: "6px 12px" }}>Send</button>
                      <button onClick={() => editingId === inv.id ? cancelEdit() : startEdit(inv)} style={{ fontSize: 11, padding: "6px 12px" }}>{editingId === inv.id ? "Cancel" : "Edit"}</button>
                      <button onClick={() => deleteInvoice(inv)} style={{ fontSize: 11, padding: "6px 12px" }}>✕</button>
                    </td>
                  </tr>
                  {editingId === inv.id && (
                    <tr>
                      <td colSpan={8} style={{ ...cellStyle, background: "var(--surface)", padding: 16 }}>
                        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, background: "var(--bg-elevated)" }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                            <select value={editContactId} onChange={(e) => setEditContactId(e.target.value)} style={{ padding: 8, minWidth: 200 }}>
                              <option value="">— No customer —</option>
                              {(contacts ?? []).map((c) => (
                                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
                              ))}
                            </select>
                            <span style={{ color: "var(--text-faint)", fontSize: 12 }}>or type new name in Add Invoice form</span>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 6 }}>
                            Line items
                          </div>
                          {editItems.map((item, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
                              <select value={item.productId ?? ""} onChange={(e) => pickItemProduct(setEditItems, i, e.target.value)} style={{ padding: 8, minWidth: 150 }}>
                                <option value="">Custom item</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}{p.price ? ` (${currency}${p.price})` : ""}</option>
                                ))}
                              </select>
                              <input placeholder="Item name" value={item.name} onChange={(e) => updateEditItem(i, "name", e.target.value)} style={{ padding: 8, flex: "1 1 140px", minWidth: 0 }} />
                              <input placeholder="Qty" type="number" min={1} value={item.quantity} onChange={(e) => updateEditItem(i, "quantity", e.target.value)} style={{ padding: 8, width: 70, flex: "0 0 70px" }} />
                              <input placeholder="Unit price" type="number" value={item.unitPrice} onChange={(e) => updateEditItem(i, "unitPrice", e.target.value)} style={{ padding: 8, width: 100 }} />
                              {!item.productId && (
                                <input
                                  placeholder="Cost price (optional)"
                                  type="number"
                                  value={item.costPrice ?? ""}
                                  onChange={(e) => updateEditItem(i, "costPrice", e.target.value)}
                                  title="What this actually costs the business -- used for profit reporting, never shown to the customer."
                                  style={{ padding: 8, width: 130 }}
                                />
                              )}
                              {editItems.length > 1 && (
                                <button onClick={() => setEditItems((prev) => prev.filter((_, idx) => idx !== i))} style={{ fontSize: 11, padding: "6px 12px" }}>✕</button>
                              )}
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8, marginBottom: 10 }}>
                            <button onClick={() => setEditItems((prev) => [...prev, { ...EMPTY_ITEM }])} style={{ fontSize: 12, padding: "6px 10px" }}>
                              + Add item
                            </button>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
                              <input placeholder="Discount" type="number" value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} style={{ padding: 8, width: 100 }} />
                              <input placeholder="Tax" type="number" value={editTax} onChange={(e) => setEditTax(e.target.value)} style={{ padding: 8, width: 100 }} />
                              <input placeholder="Due date" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} style={{ padding: 8 }} />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                            <button onClick={cancelEdit} style={{ fontSize: 12, padding: "6px 12px" }}>Cancel</button>
                            <button onClick={() => saveEdit(inv)} disabled={editSaving || validEditItems.length === 0} style={primaryButtonStyle}>
                              {editSaving ? "Saving…" : "Save Changes"}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
