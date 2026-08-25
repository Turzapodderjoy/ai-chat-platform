"use client";

import { useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, shortId } from "./dashboard-styles";

interface Contact {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Company {
  id: string;
  name: string;
}

/** A real customer record, unifying what used to be resolved fresh per
 * conversation (see ConversationService.namesForConversations) — a
 * customer who orders/books more than once shows up once here, with
 * every order/repair/conversation they've ever had attached to the
 * same person instead of looking like separate customers each time. */
export function ContactsPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/crm/contacts${qs}`)
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts));
    fetch(`/api/admin/crm/companies${qs}`)
      .then((r) => r.json())
      .then((d) => setCompanies(d.companies));
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active]);

  const companyById = useMemo(() => new Map((companies ?? []).map((c) => [c.id, c.name])), [companies]);

  const filtered = useMemo(() => {
    if (!contacts) return null;
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.id, c.name, c.phone ?? "", c.email ?? ""].some((f) => f.toLowerCase().includes(q))
    );
  }, [contacts, search]);

  async function setCompany(contact: Contact, companyId: string) {
    setBusyId(contact.id);
    try {
      await fetch("/api/admin/crm/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contact.id, companyId: companyId || null }),
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
        person (matched by phone or email) instead of scattered across separate chats.
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
                <tr key={c.id}>
                  <td style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)" }}>{shortId(c.id)}</td>
                  <td style={cellStyle}>{c.name}</td>
                  <td style={cellStyle}>{c.phone ?? "—"}</td>
                  <td style={cellStyle}>{c.email ?? "—"}</td>
                  <td style={cellStyle}>
                    <select
                      value={c.companyId ?? ""}
                      onChange={(e) => setCompany(c, e.target.value)}
                      disabled={busyId === c.id}
                      style={{ padding: 4, fontSize: 12 }}
                    >
                      <option value="">{companyById.get(c.companyId ?? "") ?? "— none —"}</option>
                      {(companies ?? []).filter((co) => co.id !== c.companyId).map((co) => (
                        <option key={co.id} value={co.id}>{co.name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={cellStyle}>{new Date(c.updatedAt).toLocaleDateString()}</td>
                  <td style={cellStyle}>
                    <button onClick={() => deleteContact(c)} disabled={busyId === c.id}>Delete</button>
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
