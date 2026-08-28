"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, shortId, badgeStyle, type BadgeTone } from "./dashboard-styles";

interface Contact {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  companyDomain: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContactRecord {
  contact: Contact;
  orders: { id: string; products: string; paymentMethod: string; createdAt: string }[];
  repairs: { id: string; trackingToken: string; deviceType: string; status: string; createdAt: string }[];
  deals: { id: string; title: string; amount: number | null; stage: string; status: string }[];
  quotes: { id: string; title: string; status: string; total: number; currency: string }[];
  invoices: { id: string; invoiceNumber: string; status: string; total: number; balanceDue: number; currency: string }[];
}

const DEAL_TONE: Record<string, BadgeTone> = { open: "info", won: "ok", lost: "error" };
const QUOTE_TONE: Record<string, BadgeTone> = { draft: "neutral", sent: "info", accepted: "ok", rejected: "error", expired: "warn" };
const INVOICE_TONE: Record<string, BadgeTone> = { draft: "neutral", issued: "info", partially_paid: "warn", paid: "ok", overdue: "error", void: "neutral" };

/** A real customer record, unifying what used to be resolved fresh per
 * conversation (see ConversationService.namesForConversations) — a
 * customer who orders/books more than once shows up once here, with
 * every order/repair/deal they've ever had attached to the same
 * person instead of looking like separate customers each time. Click a
 * row to expand their full history — the actual "connected record"
 * this is for, not just a flat list. */
export function ContactsPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [record, setRecord] = useState<ContactRecord | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<Record<string, { name: string; domain: string }>>({});

  function refresh() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/crm/contacts${qs}`)
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts));
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active]);

  const filtered = useMemo(() => {
    if (!contacts) return null;
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.id, c.name, c.phone ?? "", c.email ?? ""].some((f) => f.toLowerCase().includes(q))
    );
  }, [contacts, search]);

  function toggleRecord(contact: Contact) {
    if (expandedId === contact.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(contact.id);
    setRecord(null);
    setLoadingRecord(true);
    fetch(`/api/admin/crm/contacts?id=${encodeURIComponent(contact.id)}`)
      .then((r) => r.json())
      .then(setRecord)
      .finally(() => setLoadingRecord(false));
  }

  async function saveCompany(contact: Contact) {
    const draft = companyDraft[contact.id] ?? { name: contact.companyName ?? "", domain: contact.companyDomain ?? "" };
    setBusyId(contact.id);
    try {
      await fetch("/api/admin/crm/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contact.id, companyName: draft.name || null, companyDomain: draft.domain || null }),
      });
      setCompanyDraft((prev) => {
        const next = { ...prev };
        delete next[contact.id];
        return next;
      });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteContact(contact: Contact) {
    const confirmed = window.confirm(`Delete the contact "${contact.name}"? This cannot be undone.`);
    if (!confirmed) return;
    setBusyId(contact.id);
    try {
      await fetch(`/api/admin/crm/contacts?id=${encodeURIComponent(contact.id)}`, { method: "DELETE" });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Contacts</h2>
      <p style={subtleTextStyle}>
        Every customer who has ordered, booked a repair, or messaged in — merged into one record per
        person (matched by phone or email) instead of scattered across separate chats. Click a row to
        see their full history.
      </p>

      <input
        style={{ padding: 8, width: "100%", maxWidth: 320, marginBottom: 12 }}
        placeholder="Search by name, phone, email, ID…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {!contacts && <p style={subtleTextStyle}>Loading…</p>}
      {contacts && contacts.length === 0 && <p style={subtleTextStyle}>No contacts yet — they're created automatically from orders, repairs, and conversations.</p>}
      {contacts && contacts.length > 0 && filtered?.length === 0 && <p style={subtleTextStyle}>No contacts match that search.</p>}

      {filtered && filtered.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle}>ID</th>
                <th style={cellStyle}>Name</th>
                <th style={cellStyle}>Phone</th>
                <th style={cellStyle}>Email</th>
                <th style={cellStyle}>Company</th>
                <th style={cellStyle}>Updated</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <Fragment key={c.id}>
                  <tr onClick={() => toggleRecord(c)} style={{ cursor: "pointer" }}>
                    <td style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)" }}>{shortId(c.id)}</td>
                    <td style={cellStyle}>{c.name}</td>
                    <td style={cellStyle}>{c.phone ?? "—"}</td>
                    <td style={cellStyle}>{c.email ?? "—"}</td>
                    <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const draft = companyDraft[c.id] ?? { name: c.companyName ?? "", domain: c.companyDomain ?? "" };
                        const dirty = draft.name !== (c.companyName ?? "") || draft.domain !== (c.companyDomain ?? "");
                        return (
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <input
                              value={draft.name}
                              onChange={(e) => setCompanyDraft((prev) => ({ ...prev, [c.id]: { ...draft, name: e.target.value } }))}
                              placeholder="Company"
                              style={{ padding: 4, fontSize: 12, width: 90 }}
                            />
                            <input
                              value={draft.domain}
                              onChange={(e) => setCompanyDraft((prev) => ({ ...prev, [c.id]: { ...draft, domain: e.target.value } }))}
                              placeholder="Domain"
                              style={{ padding: 4, fontSize: 12, width: 90 }}
                            />
                            {dirty && (
                              <button onClick={() => saveCompany(c)} disabled={busyId === c.id} style={{ fontSize: 11, padding: "3px 6px" }}>
                                Save
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={cellStyle}>{new Date(c.updatedAt).toLocaleDateString()}</td>
                    <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => deleteContact(c)} disabled={busyId === c.id}>Delete</button>
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr>
                      <td colSpan={7} style={{ ...cellStyle, background: "var(--surface)", padding: 14 }}>
                        {loadingRecord && <p style={subtleTextStyle}>Loading history…</p>}
                        {record && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, fontSize: 12.5 }}>
                            <div>
                              <div style={{ fontWeight: 650, marginBottom: 6 }}>Quotes ({record.quotes.length})</div>
                              {record.quotes.length === 0 && <span style={{ color: "var(--text-faint)" }}>None</span>}
                              {record.quotes.map((q) => (
                                <div key={q.id} style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={badgeStyle(QUOTE_TONE[q.status] ?? "neutral")}>{q.status}</span>
                                  {q.title} — {q.currency}{q.total.toLocaleString()}
                                </div>
                              ))}
                            </div>
                            <div>
                              <div style={{ fontWeight: 650, marginBottom: 6 }}>Invoices ({record.invoices.length})</div>
                              {record.invoices.length === 0 && <span style={{ color: "var(--text-faint)" }}>None</span>}
                              {record.invoices.map((inv) => (
                                <div key={inv.id} style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={badgeStyle(INVOICE_TONE[inv.status] ?? "neutral")}>{inv.status}</span>
                                  {inv.invoiceNumber} — {inv.currency}{inv.total.toLocaleString()}
                                  {inv.balanceDue > 0 && <span style={{ color: "var(--danger)" }}>({inv.currency}{inv.balanceDue.toLocaleString()} due)</span>}
                                </div>
                              ))}
                            </div>
                            <div>
                              <div style={{ fontWeight: 650, marginBottom: 6 }}>Orders ({record.orders.length})</div>
                              {record.orders.length === 0 && <span style={{ color: "var(--text-faint)" }}>None</span>}
                              {record.orders.map((o) => (
                                <div key={o.id} style={{ marginBottom: 4 }}>
                                  <span style={{ color: "var(--text-faint)" }}>{new Date(o.createdAt).toLocaleDateString()}</span> — {o.products}
                                </div>
                              ))}
                            </div>
                            <div>
                              <div style={{ fontWeight: 650, marginBottom: 6 }}>Repairs ({record.repairs.length})</div>
                              {record.repairs.length === 0 && <span style={{ color: "var(--text-faint)" }}>None</span>}
                              {record.repairs.map((r) => (
                                <div key={r.id} style={{ marginBottom: 4 }}>
                                  {r.deviceType} — {r.status} <span style={{ color: "var(--text-faint)" }}>({r.trackingToken})</span>
                                </div>
                              ))}
                            </div>
                            <div>
                              <div style={{ fontWeight: 650, marginBottom: 6 }}>Deals ({record.deals.length})</div>
                              {record.deals.length === 0 && <span style={{ color: "var(--text-faint)" }}>None</span>}
                              {record.deals.map((d) => (
                                <div key={d.id} style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={badgeStyle(DEAL_TONE[d.status] ?? "neutral")}>{d.stage}</span>
                                  {d.title}{d.amount != null ? ` — ৳${d.amount.toLocaleString()}` : ""}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
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
