"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle } from "./dashboard-styles";

interface DeletedRecord {
  id: string;
  entityType: string;
  entityId: string;
  label: string;
  data: Record<string, unknown>;
  deletedBy: string;
  deletedAt: string;
}

type Col = { head: string; get: (d: Record<string, unknown>) => string };

const str = (v: unknown): string => (v === null || v === undefined || v === "" ? "—" : String(v).trim() || "—");
const len = (v: unknown): string => String(Array.isArray(v) ? v.length : 0);

// data is whatever the row looked like when it was deleted (or when a
// backup last saw it), so every accessor tolerates a missing field
// instead of assuming the shape of a row from an older schema.
const appt = (d: Record<string, unknown>) => (d.appointment ?? {}) as Record<string, unknown>;
const invoiceTotal = (d: Record<string, unknown>): number => {
  if (typeof d.totalOverride === "number") return d.totalOverride;
  const items = (d.items as { quantity: number; unitPrice: number }[] | undefined) ?? [];
  const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
  return subtotal - Number(d.discount ?? 0) + Number(d.tax ?? 0);
};
const lastMessage = (d: Record<string, unknown>): string => {
  const msgs = (d.messages as { content?: string }[] | undefined) ?? [];
  const m = msgs[msgs.length - 1]?.content;
  return m ? (m.length > 70 ? `${m.slice(0, 70)}…` : m) : "—";
};

const TYPES: { id: string; label: string; columns: Col[] }[] = [
  {
    id: "repair",
    label: "Repairs / Orders",
    columns: [
      { head: "Order #", get: (d) => str(appt(d).serialNumber) },
      { head: "Customer", get: (d) => str(appt(d).customerName) },
      { head: "Phone", get: (d) => str(appt(d).phone) },
      { head: "Device", get: (d) => [appt(d).deviceType, appt(d).deviceModel].filter(Boolean).join(" ") || "—" },
      { head: "Issue", get: (d) => str(appt(d).issueDescription) },
      { head: "Status", get: (d) => str(appt(d).status) },
      { head: "Items", get: (d) => len(appt(d).items) },
      { head: "Messages", get: (d) => len(d.messages) },
    ],
  },
  {
    id: "invoice",
    label: "Invoices",
    columns: [
      { head: "Invoice #", get: (d) => str(d.invoiceNumber) },
      { head: "Status", get: (d) => str(d.status) },
      { head: "Total", get: (d) => `${str(d.currency)} ${invoiceTotal(d).toFixed(2)}` },
      { head: "Paid", get: (d) => Number(d.amountPaid ?? 0).toFixed(2) },
      { head: "Items", get: (d) => len(d.items) },
      { head: "Payments", get: (d) => len(d.payments) },
    ],
  },
  {
    id: "contact",
    label: "Customer Database",
    columns: [
      { head: "Name", get: (d) => str(d.name) },
      { head: "Phone", get: (d) => str(d.phone) },
      { head: "Email", get: (d) => str(d.email) },
      { head: "Company", get: (d) => str(d.companyName) },
    ],
  },
  {
    id: "product",
    label: "Inventory",
    columns: [
      { head: "Name", get: (d) => str(d.name) },
      { head: "Price", get: (d) => str(d.price) },
      { head: "Cost", get: (d) => str(d.costPrice) },
      { head: "Stock", get: (d) => str(d.stock) },
      { head: "Category", get: (d) => str(d.category) },
    ],
  },
  {
    id: "conversation",
    label: "Inbox",
    columns: [
      { head: "Chat", get: (d) => str(d.id) },
      { head: "Channel", get: (d) => str(d.channel) },
      { head: "Messages", get: (d) => len(d.messages) },
      { head: "Last message", get: lastMessage },
    ],
  },
  { id: "staff", label: "Staff", columns: [{ head: "Name", get: (d) => str(d.name) }, { head: "Role", get: (d) => str(d.role) }, { head: "Email", get: (d) => str(d.email) }, { head: "Phone", get: (d) => str(d.phone) }] },
  { id: "offer", label: "Offers", columns: [{ head: "Title", get: (d) => str(d.title) }, { head: "Code", get: (d) => str(d.code) }] },
  { id: "tag", label: "Tags", columns: [{ head: "Label", get: (d) => str(d.label) }] },
  { id: "team", label: "Teams", columns: [{ head: "Name", get: (d) => str(d.name) }] },
  { id: "email-template", label: "Email templates", columns: [{ head: "Subject", get: (d) => str(d.subject) }, { head: "Status", get: (d) => str(d.status) }] },
  { id: "note", label: "Notes", columns: [{ head: "Note", get: (d) => str(d.body ?? d.text ?? d.content) }] },
  { id: "login", label: "Logins", columns: [{ head: "Username", get: (d) => str(d.username) }, { head: "Role", get: (d) => str(d.role) }] },
];

const ALL = "all";

// Every word typed has to appear somewhere in the row (label, every field
// of the saved copy, who deleted it) -- not all in one field, in any order.
function matches(r: DeletedRecord, words: string[]): boolean {
  if (words.length === 0) return true;
  const hay = `${r.entityType} ${r.label} ${r.deletedBy} ${JSON.stringify(r.data)}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Admin-only: every record deleted for this business -- deleted through
 * the app (with who/when) or recovered from database backups (marked
 * "unknown (recovered ...)") -- one table per data type, with the full
 * saved copy one click away and a fuzzy search across all of it. Never
 * rendered for a client session (see client-dashboard-client.tsx), and
 * the API behind it refuses non-admins independently. */
export function DeletedDataPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const [records, setRecords] = useState<DeletedRecord[] | null>(null);
  const [error, setError] = useState("");
  const [type, setType] = useState(ALL);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!active) return;
    setError("");
    fetch(`/api/admin/deleted-records?businessId=${encodeURIComponent(businessId)}`)
      .then(async (r) => {
        const d = (await r.json()) as { records?: DeletedRecord[]; error?: string };
        if (!r.ok) throw new Error(d.error ?? "Couldn't load deleted data.");
        setRecords(d.records ?? []);
      })
      .catch((e: Error) => setError(e.message));
    fetch(`/api/admin/clients/${businessId}`)
      .then((r) => r.json())
      .then((d: { timezone?: string }) => setTimezone(d.timezone));
  }, [businessId, active]);

  const words = useMemo(() => search.trim().toLowerCase().split(/\s+/).filter(Boolean), [search]);
  const searched = useMemo(() => (records ?? []).filter((r) => matches(r, words)), [records, words]);
  const countFor = (id: string) => (id === ALL ? searched.length : searched.filter((r) => r.entityType === id).length);
  const tabs = [{ id: ALL, label: "All" }, ...TYPES].filter((t) => t.id === ALL || countFor(t.id) > 0 || t.id === type);
  const known = new Set(TYPES.map((t) => t.id));
  const rows = searched.filter((r) => (type === ALL ? true : r.entityType === type));
  const current = TYPES.find((t) => t.id === type);
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" });
  const typeLabel = (id: string) => TYPES.find((t) => t.id === id)?.label ?? id;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Deleted Data</h2>
      <p style={subtleTextStyle}>
        Everything deleted from this client&apos;s dashboard, in one place: records deleted since tracking began (with who and when), plus older ones
        recovered from database backups, marked &quot;unknown (recovered …)&quot; with the last date a backup still had them. Only platform admins can see this.
      </p>

      <input
        type="search"
        name="aiva-search-deleted"
        autoComplete="off"
        placeholder="Search everything deleted — any word, any field…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: 8, fontSize: 12, width: "100%", maxWidth: 420, boxSizing: "border-box", marginTop: 8 }}
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0" }}>
        {tabs.map((t) => {
          const on = t.id === type;
          return (
            <button
              key={t.id}
              onClick={() => { setType(t.id); setOpenId(null); }}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: on ? "var(--accent-subtle)" : "var(--surface)",
                color: on ? "var(--accent)" : "var(--text-muted)",
                fontWeight: on ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {t.label} ({countFor(t.id)})
            </button>
          );
        })}
      </div>

      {error && <p style={{ ...subtleTextStyle, color: "var(--danger, #e5484d)" }}>{error}</p>}
      {!records && !error && <p style={subtleTextStyle}>Loading…</p>}
      {records && rows.length === 0 && <p style={subtleTextStyle}>{words.length ? "Nothing deleted matches that search." : "Nothing deleted here yet."}</p>}

      {rows.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {type === ALL || !current || !known.has(type) ? (
                  <>
                    <th style={cellStyle}>Type</th>
                    <th style={cellStyle}>Record</th>
                  </>
                ) : (
                  current.columns.map((c) => <th key={c.head} style={cellStyle}>{c.head}</th>)
                )}
                <th style={cellStyle}>Deleted by</th>
                <th style={cellStyle}>Deleted / last seen</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cols = type !== ALL && current && known.has(type) ? current.columns : null;
                return (
                  <Fragment key={r.id}>
                    <tr>
                      {cols ? (
                        cols.map((c) => <td key={c.head} style={cellStyle}>{c.get(r.data)}</td>)
                      ) : (
                        <>
                          <td style={cellStyle}>{typeLabel(r.entityType)}</td>
                          <td style={cellStyle}>{r.label}</td>
                        </>
                      )}
                      <td style={cellStyle}>{r.deletedBy}</td>
                      <td style={cellStyle}>{fmt(r.deletedAt)}</td>
                      <td style={cellStyle}>
                        <button onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ fontSize: 12 }}>
                          {openId === r.id ? "Hide" : "Full record"}
                        </button>
                      </td>
                    </tr>
                    {openId === r.id && (
                      <tr>
                        <td colSpan={(cols ? cols.length : 2) + 3} style={cellStyle}>
                          <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>
                            {JSON.stringify(r.data, null, 2)}
                          </pre>
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
    </section>
  );
}
