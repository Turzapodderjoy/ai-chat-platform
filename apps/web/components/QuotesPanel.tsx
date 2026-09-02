"use client";

import { useEffect, useMemo, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, shortId, badgeStyle, type BadgeTone } from "./dashboard-styles";

interface QuoteItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

interface Quote {
  id: string;
  businessId: string;
  contactId: string | null;
  title: string;
  status: string;
  currency: string;
  discount: number;
  tax: number;
  items: QuoteItem[];
  subtotal: number;
  total: number;
  createdAt: string;
}

interface Contact {
  id: string;
  name: string;
}

interface Client {
  id: string;
  name: string;
}

const STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;
const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", sent: "info", accepted: "ok", rejected: "error", expired: "warn" };

interface DraftItem {
  name: string;
  quantity: string;
  unitPrice: string;
}

/** Sales proposals — build a line-itemized quote against a Contact,
 * then "Generate Invoice" hands it to InvoiceService.generateFromQuote,
 * which copies the items as a snapshot rather than a live reference. */
export function QuotesPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [clients, setClients] = useState<Client[] | null>(null);

  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [targetBusinessId, setTargetBusinessId] = useState(businessId ?? "");
  const [items, setItems] = useState<DraftItem[]>([{ name: "", quantity: "1", unitPrice: "" }]);
  const [discount, setDiscount] = useState("");
  const [tax, setTax] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/revenue/quotes${qs}`)
      .then((r) => r.json())
      .then((d) => setQuotes(d.quotes));
    fetch(`/api/admin/crm/contacts${qs}`)
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts));
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active]);

  useEffect(() => {
    if (businessId) return;
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((d) => setClients(d.clients));
  }, [businessId]);

  const contactName = useMemo(() => new Map((contacts ?? []).map((c) => [c.id, c.name])), [contacts]);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function createQuote() {
    const targetId = businessId ?? targetBusinessId;
    const validItems = items.filter((i) => i.name.trim() && Number(i.unitPrice) >= 0);
    if (!targetId || !title.trim() || validItems.length === 0) return;
    setCreating(true);
    try {
      await fetch("/api/admin/revenue/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: targetId,
          title,
          contactId: contactId || undefined,
          items: validItems.map((i) => ({ name: i.name, quantity: Number(i.quantity) || 1, unitPrice: Number(i.unitPrice) || 0 })),
          discount: discount ? Number(discount) : undefined,
          tax: tax ? Number(tax) : undefined,
        }),
      });
      setTitle("");
      setContactId("");
      setItems([{ name: "", quantity: "1", unitPrice: "" }]);
      setDiscount("");
      setTax("");
      refresh();
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(quote: Quote, status: string) {
    setBusyId(quote.id);
    try {
      await fetch("/api/admin/revenue/quotes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: quote.id, status }),
      });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function generateInvoice(quote: Quote) {
    setBusyId(quote.id);
    try {
      await fetch("/api/admin/revenue/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      refresh();
      window.alert(`Invoice generated for "${quote.title}". Check the Invoices panel.`);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteQuote(quote: Quote) {
    const confirmed = window.confirm(`Delete the quote "${quote.title}"? This cannot be undone.`);
    if (!confirmed) return;
    await fetch(`/api/admin/revenue/quotes?id=${encodeURIComponent(quote.id)}`, { method: "DELETE" });
    setQuotes((prev) => prev?.filter((q) => q.id !== quote.id) ?? prev);
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Quotes</h2>
      <p style={subtleTextStyle}>Line-itemized proposals sent to a customer — accept one and generate an Invoice from it, with the items carried over as-is.</p>

      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 12, marginBottom: 20, background: "var(--surface)" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {!businessId && (
            <select value={targetBusinessId} onChange={(e) => setTargetBusinessId(e.target.value)} style={{ padding: 8 }}>
              <option value="">Select client…</option>
              {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <input style={{ padding: 8, minWidth: 180 }} placeholder="Quote title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={{ padding: 8 }}>
            <option value="">No contact</option>
            {contacts?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input style={{ padding: 6, flex: 1 }} placeholder="Item name" value={item.name} onChange={(e) => updateItem(i, { name: e.target.value })} />
            <input style={{ padding: 6, width: 80 }} type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} />
            <input style={{ padding: 6, width: 110 }} type="number" placeholder="Unit price" value={item.unitPrice} onChange={(e) => updateItem(i, { unitPrice: e.target.value })} />
            {items.length > 1 && (
              <button onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} style={{ padding: "4px 8px" }}>✕</button>
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          <button onClick={() => setItems((prev) => [...prev, { name: "", quantity: "1", unitPrice: "" }])} style={{ fontSize: 12, padding: "4px 8px" }}>+ Add item</button>
          <input style={{ padding: 6, width: 100 }} type="number" placeholder="Discount" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <input style={{ padding: 6, width: 100 }} type="number" placeholder="Tax" value={tax} onChange={(e) => setTax(e.target.value)} />
          <button onClick={createQuote} disabled={creating || !title.trim() || (!businessId && !targetBusinessId)} style={primaryButtonStyle}>
            {creating ? "Creating…" : "+ New Quote"}
          </button>
        </div>
      </div>

      {!quotes && <p style={subtleTextStyle}>Loading…</p>}
      {quotes && quotes.length === 0 && <p style={subtleTextStyle}>No quotes yet.</p>}

      {quotes && quotes.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>ID</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Title</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Contact</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Total</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td style={{ padding: "6px 8px", fontSize: 11, color: "var(--text-faint)" }}>{shortId(q.id)}</td>
                  <td style={{ padding: "6px 8px" }}>{q.title}</td>
                  <td style={{ padding: "6px 8px" }}>{q.contactId ? contactName.get(q.contactId) ?? "—" : "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{q.currency}{q.total.toLocaleString()}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <select value={q.status} onChange={(e) => setStatus(q, e.target.value)} disabled={busyId === q.id} style={{ padding: 4, fontSize: 11 }}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span style={{ marginLeft: 6, ...badgeStyle(STATUS_TONE[q.status] ?? "neutral") }}>{q.status}</span>
                  </td>
                  <td style={{ padding: "6px 8px", display: "flex", gap: 6 }}>
                    <button onClick={() => generateInvoice(q)} disabled={busyId === q.id} style={{ fontSize: 11, padding: "4px 8px" }}>Generate Invoice</button>
                    <button onClick={() => deleteQuote(q)} style={{ fontSize: 11, padding: "4px 6px" }}>✕</button>
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
