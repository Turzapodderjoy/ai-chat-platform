"use client";

import { Fragment, useEffect, useState } from "react";

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

const str = (v: unknown): string => (v === null || v === undefined || v === "" ? "—" : String(v));

// data is whatever the row looked like when it was deleted (see each
// service's archiveDeleted call), so every accessor tolerates a missing
// field instead of assuming the shape of a row from an older schema.
const appt = (d: Record<string, unknown>) => (d.appointment ?? {}) as Record<string, unknown>;
const invoiceTotal = (d: Record<string, unknown>): number => {
  if (typeof d.totalOverride === "number") return d.totalOverride;
  const items = (d.items as { quantity: number; unitPrice: number }[] | undefined) ?? [];
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  return subtotal - Number(d.discount ?? 0) + Number(d.tax ?? 0);
};

const TYPES: { id: string; label: string; columns: { head: string; get: (d: Record<string, unknown>, tz?: string) => string }[] }[] = [
  {
    id: "repair",
    label: "Repairs / Orders",
    columns: [
      { head: "Customer", get: (d) => str(appt(d).customerName) },
      { head: "Phone", get: (d) => str(appt(d).phone) },
      { head: "Device", get: (d) => [appt(d).deviceType, appt(d).deviceModel].filter(Boolean).join(" ") || "—" },
      { head: "Issue", get: (d) => str(appt(d).issueDescription) },
      { head: "Status", get: (d) => str(appt(d).status) },
      { head: "Tracking", get: (d) => str(appt(d).trackingToken) },
      { head: "Items", get: (d) => String(((appt(d).items as unknown[]) ?? []).length) },
      { head: "Messages", get: (d) => String(((d.messages as unknown[]) ?? []).length) },
    ],
  },
  {
    id: "invoice",
    label: "Invoices",
    columns: [
      { head: "Invoice", get: (d) => str(d.invoiceNumber) },
      { head: "Status", get: (d) => str(d.status) },
      { head: "Total", get: (d) => `${str(d.currency)} ${invoiceTotal(d).toFixed(2)}` },
      { head: "Paid", get: (d) => Number(d.amountPaid ?? 0).toFixed(2) },
      { head: "Items", get: (d) => String(((d.items as unknown[]) ?? []).length) },
      { head: "Payments", get: (d) => String(((d.payments as unknown[]) ?? []).length) },
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
];

/** Admin-only: every record deleted through the app for this business,
 * one table per data type, with the full saved copy one click away.
 * Never rendered for a client session (see client-dashboard-client.tsx),
 * and the API behind it refuses non-admins independently. */
export function DeletedDataPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const [records, setRecords] = useState<DeletedRecord[] | null>(null);
  const [error, setError] = useState("");
  const [type, setType] = useState(TYPES[0]!.id);
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

  const current = TYPES.find((t) => t.id === type)!;
  const rows = (records ?? []).filter((r) => r.entityType === type);
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" });

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Deleted Data</h2>
      <p style={subtleTextStyle}>
        A saved copy of everything deleted from this client&apos;s dashboard, with who deleted it and when. Only platform admins can see this.
        Anything deleted directly in the database, or before this panel existed, isn&apos;t listed.
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0" }}>
        {TYPES.map((t) => {
          const count = (records ?? []).filter((r) => r.entityType === t.id).length;
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
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {error && <p style={{ ...subtleTextStyle, color: "var(--danger, #e5484d)" }}>{error}</p>}
      {!records && !error && <p style={subtleTextStyle}>Loading…</p>}
      {records && rows.length === 0 && <p style={subtleTextStyle}>Nothing deleted here yet.</p>}

      {rows.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {current.columns.map((c) => <th key={c.head} style={cellStyle}>{c.head}</th>)}
                <th style={cellStyle}>Deleted by</th>
                <th style={cellStyle}>Deleted at</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    {current.columns.map((c) => <td key={c.head} style={cellStyle}>{c.get(r.data, timezone)}</td>)}
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
                      <td colSpan={current.columns.length + 3} style={cellStyle}>
                        <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>
                          {JSON.stringify(r.data, null, 2)}
                        </pre>
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
