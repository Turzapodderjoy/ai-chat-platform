"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { shortId } from "./dashboard-styles";
import { useCurrencySymbol } from "../lib/currency";
import { showConfirm } from "../lib/app-dialog";

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
  repairs: { id: string; trackingToken: string; deviceType: string; deviceModel: string | null; issueDescription: string; status: string; priority: string; appointmentDate: string; createdAt: string }[];
  invoices: { id: string; invoiceNumber: string; status: string; total: number; balanceDue: number; currency: string }[];
  lifetimeValue: number;
}

/** A real customer record, unifying what used to be resolved fresh per
 * conversation (see ConversationService.namesForConversations) — a
 * customer who orders/books more than once shows up once here, with
 * every order/repair they've ever had attached to the same
 * person instead of looking like separate customers each time. Click a
 * row to expand their full history — the actual "connected record"
 * this is for, not just a flat list. */
export function ContactsPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const currency = useCurrencySymbol(businessId ?? "");
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [record, setRecord] = useState<ContactRecord | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<Record<string, { name: string; domain: string }>>({});

  function refresh() {
    let mounted = true;
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/crm/contacts${qs}`)
      .then((r) => r.json())
      .then((d) => { if (mounted) setContacts(d.contacts); });
    return () => { mounted = false; };
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

  function computeCLV(record: ContactRecord): number {
    // Order has no price field (it's a flat human-readable slip, not a
    // priced line-item record -- see the Order model's own comment), so
    // CLV is real money actually collected, i.e. paid invoices only.
    return record.invoices.reduce((sum, inv) => sum + (inv.total - inv.balanceDue), 0);
  }

  async function deleteContact(contact: Contact) {
    const confirmed = await showConfirm(`Delete the contact "${contact.name}"? This cannot be undone.`);
    if (!confirmed) return;
    setBusyId(contact.id);
    try {
      await fetch(`/api/admin/crm/contacts?id=${encodeURIComponent(contact.id)}`, { method: "DELETE" });
      setContacts((prev) => prev?.filter((c) => c.id !== contact.id) ?? prev);
    } finally {
      setBusyId(null);
    }
  }

const INVOICE_LAMP: Record<string, string> = {
  draft: "lamp lamp-idle",
  issued: "lamp lamp-info",
  partially_paid: "lamp lamp-warn",
  paid: "lamp lamp-ok",
  overdue: "lamp lamp-err",
  void: "lamp lamp-idle",
};

const INVOICE_LABEL: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Part paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

const REPAIR_STATUS_LAMP: Record<string, string> = {
  booked: "lamp lamp-info",
  received: "lamp lamp-idle",
  in_repair: "lamp lamp-warn",
  ready: "lamp lamp-ok",
  completed: "lamp lamp-ok",
  cancelled: "lamp lamp-err",
};

const REPAIR_STATUS_TEXT: Record<string, string> = {
  booked: "Booked",
  received: "Received",
  in_repair: "In repair",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PRIORITY_LAMP: Record<string, string> = {
  normal: "lamp lamp-idle",
  high: "lamp lamp-warn",
  urgent: "lamp lamp-err",
};

const METRIC: CSSProperties = { minWidth: 120 };

const METRIC_LABEL: CSSProperties = { display: "block", marginBottom: 3 };

const METRIC_VALUE: CSSProperties = { fontSize: 17, fontWeight: 600, color: "var(--ink)" };

const EXPANDED_CELL: CSSProperties = { padding: 14, background: "var(--panel-sunk)" };

const SUBHEAD: CSSProperties = { display: "block", marginBottom: 8 };

return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Customer database</span>
        <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {contacts ? `${filtered?.length ?? 0} contacts` : "—"}
        </span>
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 14, maxWidth: "68ch" }}>
          Every customer who has ordered, booked a repair, or messaged in — merged into one record per
          person (matched by phone or email) instead of scattered across separate chats. Open a row to
          see their full history.
        </p>

        <div className="field" style={{ maxWidth: 340, marginBottom: 14 }}>
          <label className="field-label" htmlFor="aiva-search-contacts">Search</label>
          <input
            id="aiva-search-contacts"
            type="search"
            name="aiva-search-contacts"
            autoComplete="off"
            placeholder="Name, phone, email, or ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: 13 }}
          />
        </div>

        {!contacts && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ height: 40 }} />
            <div className="skeleton" style={{ height: 40 }} />
            <div className="skeleton" style={{ height: 40 }} />
          </div>
        )}

        {contacts && contacts.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No contacts yet</div>
            <div className="empty-state-description">
              Contacts are created automatically from orders, repairs and conversations — the first one
              appears as soon as this business gets one.
            </div>
          </div>
        )}

        {contacts && contacts.length > 0 && filtered?.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No contacts match</div>
            <div className="empty-state-description">Clear the search to see the whole customer database.</div>
          </div>
        )}

        {filtered && filtered.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th className="num">CLV</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const draft = companyDraft[c.id] ?? { name: c.companyName ?? "", domain: c.companyDomain ?? "" };
                  const dirty = draft.name !== (c.companyName ?? "") || draft.domain !== (c.companyDomain ?? "");
                  const open = expandedId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        onClick={() => toggleRecord(c)}
                        style={{ cursor: "pointer", background: open ? "var(--accent-subtle)" : undefined }}
                      >
                        <td><span className="data" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{shortId(c.id)}</span></td>
                        <td style={{ color: "var(--ink)", fontWeight: 600 }}>{c.name}</td>
                        <td><span className="data" style={{ fontSize: 12 }}>{c.phone ?? "—"}</span></td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <span className="data" style={{ fontSize: 12 }}>{c.email ?? "—"}</span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                            <div className="field" style={{ minWidth: 100 }}>
                              <label className="field-label" htmlFor={`company-name-${c.id}`}>Name</label>
                              <input
                                id={`company-name-${c.id}`}
                                value={draft.name}
                                onChange={(e) => setCompanyDraft((prev) => ({ ...prev, [c.id]: { ...draft, name: e.target.value } }))}
                                style={{ fontSize: 12 }}
                              />
                            </div>
                            <div className="field" style={{ minWidth: 100 }}>
                              <label className="field-label" htmlFor={`company-domain-${c.id}`}>Domain</label>
                              <input
                                id={`company-domain-${c.id}`}
                                value={draft.domain}
                                onChange={(e) => setCompanyDraft((prev) => ({ ...prev, [c.id]: { ...draft, domain: e.target.value } }))}
                                style={{ fontSize: 12 }}
                              />
                            </div>
                            {dirty && (
                              <button onClick={() => saveCompany(c)} disabled={busyId === c.id} className="primary sm">
                                Save
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="num">
                          {open && record ? (
                            <span style={{ color: computeCLV(record) > 0 ? "var(--success)" : "var(--ink-4)" }}>
                              {currency}{computeCLV(record).toLocaleString()}
                            </span>
                          ) : (
                            <span style={{ color: "var(--ink-4)" }}>—</span>
                          )}
                        </td>
                        <td><span className="data" style={{ fontSize: 12 }}>{new Date(c.updatedAt).toLocaleDateString()}</span></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => deleteContact(c)} disabled={busyId === c.id} className="danger sm">
                            Delete
                          </button>
                        </td>
                      </tr>

                      {open && (
                        <tr>
                          <td colSpan={8} style={EXPANDED_CELL}>
                            {loadingRecord && <p className="meta">Loading history…</p>}

                            {record && (
                              <>
                                <div className="panel-sunk" style={{ padding: "12px 14px", marginBottom: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
                                  <div style={METRIC}>
                                    <span className="instrument-label" style={METRIC_LABEL}>Customer lifetime value</span>
                                    <div className="data" style={{ ...METRIC_VALUE, color: "var(--success)" }}>
                                      {currency}{computeCLV(record).toLocaleString()}
                                    </div>
                                  </div>
                                  <div style={METRIC}>
                                    <span className="instrument-label" style={METRIC_LABEL}>Orders</span>
                                    <div className="data" style={METRIC_VALUE}>{record.orders.length}</div>
                                  </div>
                                  <div style={METRIC}>
                                    <span className="instrument-label" style={METRIC_LABEL}>Repairs</span>
                                    <div className="data" style={METRIC_VALUE}>{record.repairs.length}</div>
                                  </div>
                                  <div style={METRIC}>
                                    <span className="instrument-label" style={METRIC_LABEL}>Outstanding</span>
                                    <div
                                      className="data"
                                      style={{
                                        ...METRIC_VALUE,
                                        color: record.invoices.reduce((s, i) => s + i.balanceDue, 0) > 0 ? "var(--danger)" : "var(--ink)",
                                      }}
                                    >
                                      {currency}{record.invoices.reduce((s, i) => s + i.balanceDue, 0).toLocaleString()}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 18 }}>
                                  <div>
                                    <span className="instrument-label" style={SUBHEAD}>
                                      Invoices ({record.invoices.length})
                                    </span>
                                    {record.invoices.length === 0 && (
                                      <div className="empty-state">
                                        <div className="empty-state-title">No invoices</div>
                                        <div className="empty-state-description">Nothing billed to this customer yet.</div>
                                      </div>
                                    )}
                                    {record.invoices.map((inv) => (
                                      <div key={inv.id} style={{ marginBottom: 7 }}>
                                        <span className={INVOICE_LAMP[inv.status] ?? "lamp lamp-idle"}>
                                          {INVOICE_LABEL[inv.status] ?? inv.status}
                                        </span>
                                        <div className="data" style={{ fontSize: 12, marginTop: 3, color: "var(--ink-2)" }}>
                                          {inv.invoiceNumber}
                                          {" — "}
                                          {currency}{inv.total.toLocaleString()}
                                        </div>
                                        {inv.balanceDue > 0 && (
                                          <div className="data" style={{ fontSize: 11.5, color: "var(--danger)" }}>
                                            {currency}{inv.balanceDue.toLocaleString()} due
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>

                                  <div>
                                    <span className="instrument-label" style={SUBHEAD}>
                                      Orders ({record.orders.length})
                                    </span>
                                    {record.orders.length === 0 && (
                                      <div className="empty-state">
                                        <div className="empty-state-title">No orders</div>
                                        <div className="empty-state-description">No purchases recorded for this customer.</div>
                                      </div>
                                    )}
                                    {record.orders.map((o) => (
                                      <div key={o.id} style={{ marginBottom: 7 }}>
                                        <span className="data" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                                          {new Date(o.createdAt).toLocaleDateString()}
                                        </span>
                                        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>{o.products}</div>
                                      </div>
                                    ))}
                                  </div>

                                  <div>
                                    <span className="instrument-label" style={SUBHEAD}>
                                      Issue history ({record.repairs.length})
                                    </span>
                                    {record.repairs.length === 0 && (
                                      <div className="empty-state">
                                        <div className="empty-state-title">No repairs</div>
                                        <div className="empty-state-description">This customer has never booked a repair.</div>
                                      </div>
                                    )}
                                    {record.repairs.map((r) => (
                                      <div
                                        key={r.id}
                                        className="panel-sunk"
                                        style={{
                                          padding: "9px 11px",
                                          marginBottom: 8,
                                          opacity: r.status === "cancelled" ? 0.6 : 1,
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                                          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{r.deviceType}</span>
                                          {r.deviceModel && (
                                            <span className="data" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{r.deviceModel}</span>
                                          )}
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginTop: 5 }}>
                                          <span className={REPAIR_STATUS_LAMP[r.status] ?? "lamp lamp-idle"}>
                                            {REPAIR_STATUS_TEXT[r.status] ?? r.status}
                                          </span>
                                          {r.priority !== "normal" && (
                                            <span className={PRIORITY_LAMP[r.priority] ?? "lamp lamp-idle"}>{r.priority}</span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>
                                          {r.issueDescription}
                                        </div>
                                        <div className="data" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 5 }}>
                                          {new Date(r.appointmentDate).toLocaleDateString()}
                                          {" · "}
                                          {r.trackingToken}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </>
                            )}
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
