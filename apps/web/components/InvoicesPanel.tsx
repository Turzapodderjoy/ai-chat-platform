"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { dataStyle } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";
import { useCurrencySymbol } from "../lib/currency";
import { showAlert, showConfirm } from "../lib/app-dialog";
import { AuditHistoryButton } from "./AuditHistoryButton";

interface Invoice {
  id: string;
  businessId: string;
  contactId: string | null;
  repairAppointmentId: string | null;
  invoiceNumber: string;
  status: string;
  currency: string;
  amountPaid: number;
  discount: number;
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

const STATUS_LAMP: Record<string, string> = {
  draft: "lamp-idle",
  issued: "lamp-info",
  partially_paid: "lamp-warn",
  paid: "lamp-ok",
  overdue: "lamp-err",
  void: "lamp-idle",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Part paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

const EMPTY_ITEM: DraftItem = { name: "", quantity: "1", unitPrice: "" };

function InvoiceStatusLamp({ status, invoiceId }: { status: string; invoiceId: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className={`lamp ${STATUS_LAMP[status] ?? "lamp-idle"}`}>{STATUS_LABEL[status] ?? status}</span>
      <AuditHistoryButton entityType="invoice" entityId={invoiceId} />
    </span>
  );
}

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
  const [editingCell, setEditingCell] = useState<{ id: string; field: "total" | "paid" | "due" } | null>(null);
  const [editingCellValue, setEditingCellValue] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/admin/clients/${businessId}`)
      .then((r) => r.json())
      .then((d: { logoUrl?: string | null }) => setLogoUrl(d.logoUrl ?? null));
  }, [businessId]);

  async function uploadLogo(file: File) {
    if (!businessId) return;
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/clients/${businessId}/logo`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        await showAlert(data.error ?? "Failed to upload logo");
        return;
      }
      setLogoUrl(data.logoUrl);
    } finally {
      setUploadingLogo(false);
    }
  }

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

  // refresh() never blanks state before fetching, so polling here is
  // already silent -- keeps Total/Paid/Due and inventory-linked prices
  // current without a manual reload while this tab stays open.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, businessId]);

  const contactById = useMemo(() => new Map((contacts ?? []).map((c) => [c.id, c])), [contacts]);
  const repairById = useMemo(() => new Map(repairs.map((r) => [r.id, r])), [repairs]);

  const [search, setSearch] = useState("");

  const sortedInvoices = useMemo(() => {
    if (!invoices) return null;
    return [...invoices].sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
  }, [invoices, sortOrder]);

  // Every word typed must appear somewhere in the row (number, contact,
  // device/issue, status, amounts) -- any order, not one phrase.
  const visibleInvoices = useMemo(() => {
    if (!sortedInvoices) return null;
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return sortedInvoices;
    return sortedInvoices.filter((inv) => {
      const c = inv.contactId ? contactById.get(inv.contactId) : undefined;
      const r = inv.repairAppointmentId ? repairById.get(inv.repairAppointmentId) : undefined;
      const hay = [inv.invoiceNumber, inv.status.replace(/_/g, " "), c?.name, c?.phone, c?.email, r?.deviceType, r?.deviceModel, r?.issueDescription, inv.total, inv.amountPaid, inv.balanceDue, inv.discount]
        .filter((v) => v !== undefined && v !== null)
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [sortedInvoices, search, contactById, repairById]);

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

  async function submitAmounts(inv: Invoice, input: { total?: number; amount?: number }) {
    setBusyId(inv.id);
    try {
      const res = await fetch("/api/admin/revenue/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: inv.businessId, invoiceId: inv.id, ...input }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        await showAlert(err.error ?? "Failed to update invoice amounts");
        return;
      }
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  // Total/Paid/Due are three views of the same two numbers -- editing
  // any one cell solves for the other via the invoice's current total,
  // then commits through submitAmounts (which always goes through
  // Payment rows for the paid side, so Reports stays in sync).
  function commitAmountEdit(inv: Invoice, field: "total" | "paid" | "due", raw: string) {
    setEditingCell(null);
    const value = Math.max(0, Number(raw) || 0);
    if (field === "total") submitAmounts(inv, { total: value });
    else if (field === "paid") submitAmounts(inv, { amount: value });
    else submitAmounts(inv, { amount: Math.max(0, inv.total - value) });
  }

  function startCellEdit(inv: Invoice, field: "total" | "paid" | "due") {
    const current = field === "total" ? inv.total : field === "paid" ? inv.amountPaid : inv.balanceDue;
    setEditingCell({ id: inv.id, field });
    setEditingCellValue(String(current));
  }

  // The customer paid less than the total: record the shortfall as a
  // discount and close the invoice, rather than hand-overriding the price.
  async function finalizeInvoice(inv: Invoice) {
    const ok = await showConfirm(
      `${currency}${inv.amountPaid.toLocaleString()} of ${currency}${inv.total.toLocaleString()} was paid. Finalize ${inv.invoiceNumber} with a ${currency}${inv.balanceDue.toLocaleString()} discount?`
    );
    if (!ok) return;
    setBusyId(inv.id);
    try {
      const res = await fetch("/api/admin/revenue/invoices/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inv.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        await showAlert(err.error ?? "Couldn't finalize the invoice");
        return;
      }
      refresh();
    } finally {
      setBusyId(null);
    }
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
        await showAlert(data.error ?? "Failed to send invoice");
        return;
      }
      await showAlert(`Invoice ${inv.invoiceNumber} sent.`);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteInvoice(inv: Invoice) {
    const confirmed = await showConfirm(`Delete invoice ${inv.invoiceNumber}? This cannot be undone.`);
    if (!confirmed) return;
    const res = await fetch(`/api/admin/revenue/invoices?id=${encodeURIComponent(inv.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      await showAlert(err.error ?? "Failed to delete invoice");
      return;
    }
    setInvoices((prev) => prev?.filter((i) => i.id !== inv.id) ?? prev);
  }

return (
    <section className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-head" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span className="instrument-label">Invoices</span>
          <div className="meta">
            Billed amounts owed by a customer, generated from a repair order or added by hand.
          </div>
        </div>
        {businessId && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a small settings thumbnail, no responsive-image needs
              <img
                src={logoUrl}
                alt="Business logo"
                style={{ width: 30, height: 30, objectFit: "contain", borderRadius: "var(--r-xs)", border: "1px solid var(--line)", background: "var(--panel)" }}
              />
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadingLogo}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
              style={{ display: "none" }}
              aria-label="Invoice logo file"
            />
            <button
              type="button"
              className="sm"
              disabled={uploadingLogo}
              onClick={() => logoInputRef.current?.click()}
              title="Shown at the top of every printed invoice"
            >
              {uploadingLogo ? "Uploading logo" : logoUrl ? "Change invoice logo" : "Add invoice logo"}
            </button>
            <button type="button" className="primary sm" onClick={() => setShowAdd((s) => !s)}>
              {showAdd ? "Close new invoice" : "New invoice"}
            </button>
          </div>
        )}
      </div>

      <div className="panel-body">
        {showAdd && (
          <div className="panel-sunk" style={{ padding: 14, marginBottom: 14 }}>
            <div className="instrument-label" style={{ marginBottom: 10 }}>
              New invoice
            </div>

            <div className="field" style={{ marginBottom: 10 }}>
              <label className="field-label" htmlFor="inv-draft-contact">Customer</label>
              <select
                id="inv-draft-contact"
                value={draftContactId}
                onChange={(e) => setDraftContactId(e.target.value)}
                disabled={!!draftNewName.trim()}
              >
                <option value="">Existing customer</option>
                {(contacts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
                ))}
              </select>
              <div className="field-hint">
                Type a name below to create a new customer instead of picking an existing one.
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 10, marginBottom: 12 }}>
              <div className="field">
                <label className="field-label" htmlFor="inv-draft-name">New customer name</label>
                <input id="inv-draft-name" value={draftNewName} onChange={(e) => setDraftNewName(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="inv-draft-phone">Phone</label>
                <input
                  id="inv-draft-phone"
                  type="tel"
                  inputMode="tel"
                  value={draftNewPhone}
                  onChange={(e) => setDraftNewPhone(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="inv-draft-email">Email</label>
                <input
                  id="inv-draft-email"
                  type="email"
                  inputMode="email"
                  value={draftNewEmail}
                  onChange={(e) => setDraftNewEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="instrument-label" style={{ marginBottom: 8 }}>
              Line items
            </div>
            <div className="field-hint" style={{ marginBottom: 8 }}>
              Pick a part from Inventory to fill its sell price, or type a custom line.
            </div>

            {draftItems.map((item, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "flex-end" }}
              >
                <div className="field" style={{ flex: "1 1 170px", minWidth: 0 }}>
                  {i === 0 && <label className="field-label" htmlFor="inv-draft-product-0">Inventory part</label>}
                  <select
                    id={i === 0 ? "inv-draft-product-0" : undefined}
                    aria-label={i === 0 ? undefined : "Inventory part"}
                    value={item.productId ?? ""}
                    onChange={(e) => pickItemProduct(setDraftItems, i, e.target.value)}
                  >
                    <option value="">Custom line</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.price ? ` (${currency}${p.price})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: "2 1 170px", minWidth: 0 }}>
                  {i === 0 && <label className="field-label" htmlFor="inv-draft-name-0">Description</label>}
                  <input
                    id={i === 0 ? "inv-draft-name-0" : undefined}
                    aria-label={i === 0 ? undefined : "Description"}
                    value={item.name}
                    onChange={(e) => updateDraftItem(i, "name", e.target.value)}
                  />
                </div>
                <div className="field" style={{ width: 74, flex: "0 0 74px" }}>
                  {i === 0 && <label className="field-label" htmlFor="inv-draft-qty-0">Qty</label>}
                  <input
                    id={i === 0 ? "inv-draft-qty-0" : undefined}
                    aria-label={i === 0 ? undefined : "Quantity"}
                    className="data"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateDraftItem(i, "quantity", e.target.value)}
                  />
                </div>
                <div className="field" style={{ width: 106, flex: "0 0 106px" }}>
                  {i === 0 && <label className="field-label" htmlFor="inv-draft-price-0">Unit price</label>}
                  <input
                    id={i === 0 ? "inv-draft-price-0" : undefined}
                    aria-label={i === 0 ? undefined : "Unit price"}
                    className="data"
                    type="number"
                    inputMode="decimal"
                    value={item.unitPrice}
                    onChange={(e) => updateDraftItem(i, "unitPrice", e.target.value)}
                  />
                </div>
                {!item.productId && (
                  <div className="field" style={{ width: 128, flex: "0 0 128px" }}>
                    {i === 0 && <label className="field-label" htmlFor="inv-draft-cost-0">Cost price</label>}
                    <input
                      id={i === 0 ? "inv-draft-cost-0" : undefined}
                      aria-label={i === 0 ? undefined : "Cost price, used for profit reporting only"}
                      className="data"
                      type="number"
                      inputMode="decimal"
                      value={item.costPrice ?? ""}
                      onChange={(e) => updateDraftItem(i, "costPrice", e.target.value)}
                    />
                  </div>
                )}
                {draftItems.length > 1 && (
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => setDraftItems((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remove line ${i + 1}`}
                    title={`Remove line ${i + 1}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
            <div className="field-hint" style={{ marginBottom: 10 }}>
              A custom line&apos;s cost price feeds profit reporting only. It never reaches the printed invoice.
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                className="sm"
                onClick={() => setDraftItems((prev) => [...prev, { ...EMPTY_ITEM }])}
              >
                Add line item
              </button>
              <div className="field" style={{ width: 104, flex: "0 0 104px" }}>
                <label className="field-label" htmlFor="inv-draft-discount">Discount</label>
                <input
                  id="inv-draft-discount"
                  className="data"
                  type="number"
                  inputMode="decimal"
                  value={draftDiscount}
                  onChange={(e) => setDraftDiscount(e.target.value)}
                />
              </div>
              <div className="field" style={{ width: 104, flex: "0 0 104px" }}>
                <label className="field-label" htmlFor="inv-draft-tax">Tax</label>
                <input
                  id="inv-draft-tax"
                  className="data"
                  type="number"
                  inputMode="decimal"
                  value={draftTax}
                  onChange={(e) => setDraftTax(e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: "0 0 150px" }}>
                <label className="field-label" htmlFor="inv-draft-due">Due date</label>
                <input
                  id="inv-draft-due"
                  type="date"
                  value={draftDueDate}
                  onChange={(e) => setDraftDueDate(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="primary"
                style={{ marginLeft: "auto" }}
                onClick={createInvoice}
                disabled={saving || validDraftItems.length === 0}
              >
                {saving ? "Saving invoice" : "Save invoice"}
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

        {!invoices && <p className="meta">Loading invoices</p>}

        {invoices && invoices.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-title">No invoices yet</span>
            <span className="empty-state-description">
              Generate one from a repair order, or add one by hand above.
            </span>
          </div>
        )}

        {invoices && invoices.length > 0 && (
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <div className="field" style={{ flex: "1 1 240px", maxWidth: 420, minWidth: 0 }}>
              <label className="field-label" htmlFor="inv-search">Search invoices</label>
              <input
                id="inv-search"
                type="search"
                name="aiva-search-invoices"
                autoComplete="off"
                placeholder="Number, customer, device, status, amount"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="field" style={{ flexShrink: 0 }}>
              <label className="field-label" htmlFor="inv-sort">Order</label>
              <select
                id="inv-sort"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            <span className="meta" style={{ alignSelf: "flex-end", paddingBottom: 9 }}>Amounts in {currency}</span>
          </div>
        )}

        {invoices && invoices.length > 0 && visibleInvoices?.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-title">Nothing matches that search</span>
            <span className="empty-state-description">Clear the search box to see all {invoices.length} invoices.</span>
          </div>
        )}

        {invoices && invoices.length > 0 && (visibleInvoices ?? []).length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Device / Issue</th>
                  <th className="num" style={{ textAlign: "right" }}>Total</th>
                  <th className="num" style={{ textAlign: "right" }}>Discount</th>
                  <th className="num" style={{ textAlign: "right" }}>Paid</th>
                  <th className="num" style={{ textAlign: "right" }}>Due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(visibleInvoices ?? []).map((inv) => {
                  const amountCell = (field: "total" | "paid" | "due", label: string) => {
                    const value = field === "total" ? inv.total : field === "paid" ? inv.amountPaid : inv.balanceDue;
                    const isEditing = editingCell?.id === inv.id && editingCell.field === field;
                    if (isEditing) {
                      return (
                        <td key={field} className="num" style={{ textAlign: "right" }}>
                          <input
                            type="number"
                            inputMode="decimal"
                            className="data"
                            aria-label={`${label} for invoice ${inv.invoiceNumber}`}
                            autoFocus
                            value={editingCellValue}
                            disabled={busyId === inv.id}
                            onChange={(e) => setEditingCellValue(e.target.value)}
                            onBlur={(e) => commitAmountEdit(inv, field, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingCell(null); }}
                            style={{ width: 100, textAlign: "right" }}
                          />
                        </td>
                      );
                    }
                    return (
                      <td
                        key={field}
                        className="num"
                        style={{
                          textAlign: "right",
                          color:
                            field === "due" && value > 0
                              ? "var(--danger)"
                              : field === "due"
                                ? "var(--success)"
                                : "var(--ink)",
                          fontWeight: 600,
                        }}
                      >
                        <button
                          type="button"
                          className="plain data"
                          style={{ fontWeight: 600, textAlign: "right", width: "100%" }}
                          onClick={() => startCellEdit(inv, field)}
                          aria-label={`Edit ${label.toLowerCase()} on invoice ${inv.invoiceNumber}, currently ${value}`}
                          title="Edit this amount"
                        >
                          {currency}{value.toLocaleString()}
                        </button>
                      </td>
                    );
                  };

                  const contact = inv.contactId ? contactById.get(inv.contactId) : undefined;
                  const repair = inv.repairAppointmentId ? repairById.get(inv.repairAppointmentId) : undefined;

                  return (
                    <Fragment key={inv.id}>
                      <tr>
                        <td className="data" style={{ fontWeight: 600, color: "var(--ink)" }}>{inv.invoiceNumber}</td>
                        <td>
                          {contact ? (
                            <>
                              {contact.name}
                              <div className="meta">
                                {[contact.phone, contact.email].filter(Boolean).join(", ")}
                              </div>
                            </>
                          ) : (
                            <span className="meta">No customer on file</span>
                          )}
                        </td>
                        <td>
                          {repair ? (
                            <>
                              {repair.deviceType}
                              {repair.deviceModel ? ` ${repair.deviceModel}` : ""}
                              <div className="meta">{repair.issueDescription}</div>
                            </>
                          ) : (
                            <span className="meta">No repair on file</span>
                          )}
                        </td>
                        {amountCell("total", "Total")}
                        <td className="num" style={{ textAlign: "right" }}>
                          {inv.discount > 0 ? (
                            <span style={dataStyle}>{`-${currency}${inv.discount.toLocaleString()}`}</span>
                          ) : (
                            <span className="meta">—</span>
                          )}
                        </td>
                        {amountCell("paid", "Paid")}
                        {amountCell("due", "Due")}
                        <td>
                          <InvoiceStatusLamp status={inv.status} invoiceId={inv.id} />
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {inv.amountPaid > 0 && inv.balanceDue > 0 && (
                              <button
                                type="button"
                                className="sm"
                                onClick={() => finalizeInvoice(inv)}
                                disabled={busyId === inv.id}
                                title="Record what the customer did not pay as a discount and close this invoice"
                              >
                                Close with discount
                              </button>
                            )}
                            <button type="button" className="sm" onClick={() => printInvoice(inv)}>Print</button>
                            <button type="button" className="sm" onClick={() => sendInvoice(inv)} disabled={busyId === inv.id}>Send invoice</button>
                            <button type="button" className="sm" onClick={() => editingId === inv.id ? cancelEdit() : startEdit(inv)}>
                              {editingId === inv.id ? "Cancel edit" : "Edit invoice"}
                            </button>
                            <button
                              type="button"
                              className="ghost sm"
                              onClick={() => deleteInvoice(inv)}
                              aria-label={`Delete invoice ${inv.invoiceNumber}`}
                              title={`Delete invoice ${inv.invoiceNumber}`}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingId === inv.id && (
                        <tr>
                          <td colSpan={9} style={{ background: "var(--panel-sunk)", padding: 14 }}>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                              <div className="field" style={{ flex: "1 1 220px", minWidth: 0 }}>
                                <label className="field-label" htmlFor="inv-edit-contact">Customer</label>
                                <select
                                  id="inv-edit-contact"
                                  value={editContactId}
                                  onChange={(e) => setEditContactId(e.target.value)}
                                >
                                  <option value="">No customer</option>
                                  {(contacts ?? []).map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
                                  ))}
                                </select>
                              </div>
                              <span className="meta" style={{ paddingBottom: 9 }}>
                                To bill someone new, add them in the new invoice form first.
                              </span>
                            </div>

                            <div className="instrument-label" style={{ marginBottom: 8 }}>Line items</div>
                            {editItems.map((item, i) => (
                              <div
                                key={i}
                                style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "flex-end" }}
                              >
                                <div className="field" style={{ flex: "1 1 170px", minWidth: 0 }}>
                                  {i === 0 && <label className="field-label" htmlFor="inv-edit-product-0">Inventory part</label>}
                                  <select
                                    id={i === 0 ? "inv-edit-product-0" : undefined}
                                    aria-label={i === 0 ? undefined : "Inventory part"}
                                    value={item.productId ?? ""}
                                    onChange={(e) => pickItemProduct(setEditItems, i, e.target.value)}
                                  >
                                    <option value="">Custom line</option>
                                    {products.map((p) => (
                                      <option key={p.id} value={p.id}>{p.name}{p.price ? ` (${currency}${p.price})` : ""}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="field" style={{ flex: "2 1 170px", minWidth: 0 }}>
                                  {i === 0 && <label className="field-label" htmlFor="inv-edit-name-0">Description</label>}
                                  <input
                                    id={i === 0 ? "inv-edit-name-0" : undefined}
                                    aria-label={i === 0 ? undefined : "Description"}
                                    value={item.name}
                                    onChange={(e) => updateEditItem(i, "name", e.target.value)}
                                  />
                                </div>
                                <div className="field" style={{ width: 74, flex: "0 0 74px" }}>
                                  {i === 0 && <label className="field-label" htmlFor="inv-edit-qty-0">Qty</label>}
                                  <input
                                    id={i === 0 ? "inv-edit-qty-0" : undefined}
                                    aria-label={i === 0 ? undefined : "Quantity"}
                                    className="data"
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    value={item.quantity}
                                    onChange={(e) => updateEditItem(i, "quantity", e.target.value)}
                                  />
                                </div>
                                <div className="field" style={{ width: 106, flex: "0 0 106px" }}>
                                  {i === 0 && <label className="field-label" htmlFor="inv-edit-price-0">Unit price</label>}
                                  <input
                                    id={i === 0 ? "inv-edit-price-0" : undefined}
                                    aria-label={i === 0 ? undefined : "Unit price"}
                                    className="data"
                                    type="number"
                                    inputMode="decimal"
                                    value={item.unitPrice}
                                    onChange={(e) => updateEditItem(i, "unitPrice", e.target.value)}
                                  />
                                </div>
                                {!item.productId && (
                                  <div className="field" style={{ width: 128, flex: "0 0 128px" }}>
                                    {i === 0 && <label className="field-label" htmlFor="inv-edit-cost-0">Cost price</label>}
                                    <input
                                      id={i === 0 ? "inv-edit-cost-0" : undefined}
                                      aria-label={i === 0 ? undefined : "Cost price, used for profit reporting only"}
                                      className="data"
                                      type="number"
                                      inputMode="decimal"
                                      value={item.costPrice ?? ""}
                                      onChange={(e) => updateEditItem(i, "costPrice", e.target.value)}
                                    />
                                  </div>
                                )}
                                {editItems.length > 1 && (
                                  <button
                                    type="button"
                                    className="ghost sm"
                                    onClick={() => setEditItems((prev) => prev.filter((_, idx) => idx !== i))}
                                    aria-label={`Remove line ${i + 1}`}
                                    title={`Remove line ${i + 1}`}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                  </button>
                                )}
                              </div>
                            ))}

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
                              <button
                                type="button"
                                className="sm"
                                onClick={() => setEditItems((prev) => [...prev, { ...EMPTY_ITEM }])}
                              >
                                Add line item
                              </button>
                              <div className="field" style={{ width: 104, flex: "0 0 104px" }}>
                                <label className="field-label" htmlFor="inv-edit-discount">Discount</label>
                                <input
                                  id="inv-edit-discount"
                                  className="data"
                                  type="number"
                                  inputMode="decimal"
                                  value={editDiscount}
                                  onChange={(e) => setEditDiscount(e.target.value)}
                                />
                              </div>
                              <div className="field" style={{ width: 104, flex: "0 0 104px" }}>
                                <label className="field-label" htmlFor="inv-edit-tax">Tax</label>
                                <input
                                  id="inv-edit-tax"
                                  className="data"
                                  type="number"
                                  inputMode="decimal"
                                  value={editTax}
                                  onChange={(e) => setEditTax(e.target.value)}
                                />
                              </div>
                              <div className="field" style={{ flex: "0 0 150px" }}>
                                <label className="field-label" htmlFor="inv-edit-due">Due date</label>
                                <input
                                  id="inv-edit-due"
                                  type="date"
                                  value={editDueDate}
                                  onChange={(e) => setEditDueDate(e.target.value)}
                                />
                              </div>
                              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                                <button type="button" className="ghost" onClick={cancelEdit}>Cancel</button>
                                <button
                                  type="button"
                                  className="primary"
                                  onClick={() => saveEdit(inv)}
                                  disabled={editSaving || validEditItems.length === 0}
                                >
                                  {editSaving ? "Saving invoice" : "Save invoice"}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}