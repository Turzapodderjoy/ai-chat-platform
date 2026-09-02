"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, shortId, primaryButtonStyle, badgeStyle } from "./dashboard-styles";
import { MessageTagControl } from "./MessageTagControl";
import { OrderItemsEditor, orderTotal, type RepairOrder, type Product } from "./OrderManagementPanel";

interface AiOrder {
  id: string;
  customerName: string;
  phone: string;
  email?: string | null;
  deliveryAddress: string;
  products: string;
  paymentMethod: string;
  createdAt: string;
}

interface Tag {
  id: string;
  label: string;
  color: string | null;
}

interface TagAssignment {
  tagId: string;
  label: string;
  color: string | null;
  source: string;
}

type Row =
  | { kind: "ai"; id: string; date: string; customerName: string; phone: string; detail: string; status: string; total: null; data: AiOrder }
  | { kind: "service"; id: string; date: string; customerName: string; phone: string; detail: string; status: string; total: number; data: RepairOrder };

/** One unified Order Management view — every order the AI has taken
 * directly inside a chat (conversational, no billing) alongside every
 * service/repair job (staff-managed, itemized parts/services billing
 * wired to Inventory, generates real Invoices) in the SAME table, not
 * two separate panels or a tab toggle. A "Type" column distinguishes
 * them since the two are genuinely different records (Order vs
 * RepairAppointment) under the hood, but they belong in one place from
 * a staff member's point of view — "all our orders". */
export function OrdersPanel({ businessId }: { businessId: string }) {
  const [aiOrders, setAiOrders] = useState<AiOrder[] | null>(null);
  const [serviceOrders, setServiceOrders] = useState<RepairOrder[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [tagCatalog, setTagCatalog] = useState<Tag[]>([]);
  const [orderTags, setOrderTags] = useState<Record<string, TagAssignment[]>>({});
  const [deviceModelOptions, setDeviceModelOptions] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ customerName: "", phone: "", email: "", deviceType: "", deviceModel: "", issueDescription: "" });
  const [saving, setSaving] = useState(false);

  function refreshOrderTags(ids: string[]) {
    if (ids.length === 0) return;
    fetch(`/api/admin/tags/for-orders?ids=${ids.join(",")}`)
      .then((r) => r.json())
      .then((d: { tagsByOrderId: Record<string, TagAssignment[]> }) => setOrderTags(d.tagsByOrderId));
  }

  function refresh() {
    fetch(`/api/admin/orders?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data: AiOrder[]) => {
        setAiOrders(data);
        if (data.length > 0) refreshOrderTags(data.map((o) => o.id));
      });
    fetch(`/api/admin/repairs?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { appointments: RepairOrder[] }) => {
        setServiceOrders(d.appointments);
        // Device-model dropdown auto-grows from real history -- no
        // separate managed catalog needed.
        setDeviceModelOptions([...new Set(d.appointments.map((a) => a.deviceModel).filter((x): x is string => !!x))]);
      });
    fetch(`/api/admin/products?businessId=${encodeURIComponent(businessId)}&limit=200`)
      .then((r) => r.json())
      .then((d: { products: Product[] }) => setProducts(d.products));
  }

  useEffect(() => {
    refresh();
    fetch(`/api/admin/tags?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { tags: Tag[] }) => setTagCatalog(d.tags));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function assignTag(orderId: string, tagId: string) {
    await fetch("/api/admin/tags/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, tagId }),
    });
    refreshOrderTags(aiOrders?.map((o) => o.id) ?? []);
  }

  async function removeTag(orderId: string, tagId: string) {
    await fetch(`/api/admin/tags/assign?orderId=${encodeURIComponent(orderId)}&tagId=${encodeURIComponent(tagId)}`, { method: "DELETE" });
    refreshOrderTags(aiOrders?.map((o) => o.id) ?? []);
  }

  async function createOrder() {
    if (!form.customerName.trim() || !form.phone.trim() || !form.deviceType.trim() || !form.issueDescription.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/repairs/order-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...form }),
      });
      if (res.ok) {
        setForm({ customerName: "", phone: "", email: "", deviceType: "", deviceModel: "", issueDescription: "" });
        setShowNew(false);
        refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  const rows: Row[] | null = useMemo(() => {
    if (!aiOrders || !serviceOrders) return null;
    const ai: Row[] = aiOrders.map((o) => ({
      kind: "ai",
      id: o.id,
      date: o.createdAt,
      customerName: o.customerName,
      phone: o.phone,
      detail: o.products,
      status: o.paymentMethod,
      total: null,
      data: o,
    }));
    const service: Row[] = serviceOrders.map((o) => ({
      kind: "service",
      id: o.id,
      date: o.appointmentDate,
      customerName: o.customerName,
      phone: o.phone,
      detail: `${o.deviceType}${o.deviceModel ? ` (${o.deviceModel})` : ""}`,
      status: o.status,
      total: orderTotal(o),
      data: o,
    }));
    return [...ai, ...service].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [aiOrders, serviceOrders]);

  // Fuzzy-ish: case-insensitive substring match across every field a
  // staff member would actually search by (name, phone, serial/ID,
  // device, products) -- no fuzzy-match library needed for this size.
  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;

    return rows.filter((r) => {
      if (from !== null || to !== null) {
        const t = new Date(r.date).getTime();
        if (from !== null && t < from) return false;
        if (to !== null && t > to) return false;
      }
      if (!q) return true;
      const serial = r.kind === "service" ? r.data.serialNumber : undefined;
      return [r.id, serial, r.customerName, r.phone, r.detail, r.status]
        .some((f) => f?.toLowerCase().includes(q));
    });
  }, [rows, search, dateFrom, dateTo]);

  const loading = !aiOrders || !serviceOrders;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Order Management</h2>
      <p style={subtleTextStyle}>
        Every order — taken by the AI directly in a chat, or a staff-managed service/repair job with itemized
        parts &amp; services billed against Inventory and Invoices — in one place.
      </p>

      <button onClick={() => setShowNew((s) => !s)} style={primaryButtonStyle}>
        {showNew ? "Cancel" : "+ New service order"}
      </button>

      {showNew && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Customer name *" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} style={{ padding: 8 }} />
          <input placeholder="Phone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ padding: 8 }} />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ padding: 8 }} />
          <input placeholder="Device type *" value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value })} style={{ padding: 8 }} />
          <input list="device-models" placeholder="Device model" value={form.deviceModel} onChange={(e) => setForm({ ...form, deviceModel: e.target.value })} style={{ padding: 8 }} />
          <datalist id="device-models">
            {deviceModelOptions.map((m) => <option key={m} value={m} />)}
          </datalist>
          <input placeholder="Issue *" value={form.issueDescription} onChange={(e) => setForm({ ...form, issueDescription: e.target.value })} style={{ padding: 8, flex: 1, minWidth: 180 }} />
          <button onClick={createOrder} disabled={saving} style={primaryButtonStyle}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap", alignItems: "center" }}>
        <input
          style={{ padding: 8, flex: 1, minWidth: 220, maxWidth: 320 }}
          placeholder="Search by name, phone, serial/order ID, device, product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label style={{ ...subtleTextStyle, display: "flex", alignItems: "center", gap: 6 }}>
          From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: 6 }} />
        </label>
        <label style={{ ...subtleTextStyle, display: "flex", alignItems: "center", gap: 6 }}>
          To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: 6 }} />
        </label>
        {(search || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }} style={{ fontSize: 12, padding: "6px 10px" }}>
            Clear filters
          </button>
        )}
      </div>

      {loading && <p style={subtleTextStyle}>Loading…</p>}
      {!loading && rows && rows.length === 0 && <p style={subtleTextStyle}>No orders yet.</p>}
      {!loading && rows && rows.length > 0 && filtered?.length === 0 && <p style={subtleTextStyle}>No orders match that search/date range.</p>}

      {filtered && filtered.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle}>Type</th>
                <th style={cellStyle}>ID / Serial</th>
                <th style={cellStyle}>Date</th>
                <th style={cellStyle}>Customer</th>
                <th style={cellStyle}>Phone</th>
                <th style={cellStyle}>Detail</th>
                <th style={cellStyle}>Status / Payment</th>
                <th style={cellStyle}>Total</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td style={cellStyle}>
                      <span style={badgeStyle(r.kind === "ai" ? "info" : "neutral")}>{r.kind === "ai" ? "AI Order" : "Service"}</span>
                    </td>
                    <td style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)" }}>
                      {r.kind === "service" ? r.data.serialNumber ?? shortId(r.id) : shortId(r.id)}
                    </td>
                    <td style={cellStyle}>{new Date(r.date).toLocaleString()}</td>
                    <td style={cellStyle}>{r.customerName}</td>
                    <td style={cellStyle}>{r.phone}</td>
                    <td style={cellStyle}>{r.detail}</td>
                    <td style={cellStyle}>{r.status}</td>
                    <td style={cellStyle}>{r.total !== null ? `৳${r.total}` : "—"}</td>
                    <td style={cellStyle}>
                      {r.kind === "ai" ? (
                        <MessageTagControl
                          catalog={tagCatalog}
                          applied={orderTags[r.id] ?? []}
                          onAssign={(tagId) => assignTag(r.id, tagId)}
                          onRemove={(tagId) => removeTag(r.id, tagId)}
                        />
                      ) : (
                        <button onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ fontSize: 12, padding: "4px 10px" }}>
                          {openId === r.id ? "Close" : "Open"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {r.kind === "service" && openId === r.id && (
                    <tr>
                      <td colSpan={9} style={{ ...cellStyle, background: "var(--surface)" }}>
                        <OrderItemsEditor order={r.data} products={products} onChanged={refresh} />
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
