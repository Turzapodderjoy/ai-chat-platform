"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, shortId, primaryButtonStyle, badgeStyle } from "./dashboard-styles";
import { useCurrencySymbol } from "../lib/currency";
import { MessageTagControl } from "./MessageTagControl";
import { OrderItemsEditor, orderTotal, type RepairOrder, type Product } from "./OrderManagementPanel";
import { showConfirm } from "../lib/app-dialog";

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
 * two separate panels or a tab toggle. The two are genuinely different
 * records (Order vs RepairAppointment) under the hood, but they belong
 * in one place from a staff member's point of view — "all our orders". */
export function OrdersPanel({ businessId, businessType, accountRole }: { businessId: string; businessType?: string; accountRole?: string | null }) {
  const canDelete = accountRole === "owner" || accountRole === "admin";
  const currency = useCurrencySymbol(businessId);
  const [aiOrders, setAiOrders] = useState<AiOrder[] | null>(null);
  const [serviceOrders, setServiceOrders] = useState<RepairOrder[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [tagCatalog, setTagCatalog] = useState<Tag[]>([]);
  const [orderTags, setOrderTags] = useState<Record<string, TagAssignment[]>>({});
  const [deviceModelOptions, setDeviceModelOptions] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [openId, setOpenId] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ customerName: "", phone: "", email: "", deviceType: "", deviceModel: "", issueDescription: "", isWalkIn: false });
  const [saving, setSaving] = useState(false);

  // Parts/services added while the order doesn't exist yet -- held here
  // and sent along with the create request, instead of forcing a second
  // trip through "create, then reopen, then add items" for the common
  // case of already knowing the price up front.
  const [draftItems, setDraftItems] = useState<{ kind: "part" | "service"; productId?: string; name: string; quantity: string; price: string; costPrice?: string }[]>([]);
  const [newItemKind, setNewItemKind] = useState<"part" | "service">("part");
  const [newItemProductId, setNewItemProductId] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("1");
  const [newItemPrice, setNewItemPrice] = useState("");
  // Custom (non-inventory) item only -- an inventory pick's cost always
  // comes from Product.costPrice on the backend, silently, never shown
  // here (staff picking a real part sees only its sell price).
  const [newItemCostPrice, setNewItemCostPrice] = useState("");

  function pickNewItemProduct(id: string) {
    setNewItemProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) {
      setNewItemName(p.name);
      setNewItemPrice(p.price ?? "0");
    } else {
      setNewItemName("");
      setNewItemPrice("");
    }
  }

  function addDraftItem() {
    if (!newItemName.trim() || !newItemPrice.trim()) return;
    const isInventoryPick = newItemKind === "part" && !!newItemProductId;
    setDraftItems((items) => [
      ...items,
      {
        kind: newItemKind,
        productId: isInventoryPick ? newItemProductId : undefined,
        name: newItemName,
        quantity: newItemQuantity,
        price: newItemPrice,
        costPrice: isInventoryPick ? undefined : (newItemCostPrice.trim() || undefined),
      },
    ]);
    setNewItemProductId("");
    setNewItemName("");
    setNewItemQuantity("1");
    setNewItemPrice("");
    setNewItemCostPrice("");
  }

  function removeDraftItem(index: number) {
    setDraftItems((items) => items.filter((_, i) => i !== index));
  }

  function refreshOrderTags(ids: string[]) {
    if (ids.length === 0) return;
    fetch(`/api/admin/tags/for-orders?ids=${ids.join(",")}`)
      .then((r) => r.json())
      .then((d: { tagsByOrderId: Record<string, TagAssignment[]> }) => setOrderTags(d.tagsByOrderId));
  }

  function refresh() {
    let mounted = true;
    fetch(`/api/admin/orders?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data: AiOrder[]) => { if (mounted) { setAiOrders(data); if (data.length > 0) refreshOrderTags(data.map((o) => o.id)); } });
    fetch(`/api/admin/repairs?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { appointments: RepairOrder[] }) => { if (mounted) { setServiceOrders(d.appointments); setDeviceModelOptions([...new Set(d.appointments.map((a) => a.deviceModel).filter((x): x is string => !!x))]); } });
    fetch(`/api/admin/products?businessId=${encodeURIComponent(businessId)}&limit=200`)
      .then((r) => r.json())
      .then((d: { products: Product[] }) => { if (mounted) setProducts(d.products); });
    return () => { mounted = false; };
  }

  async function deleteRow(r: Row) {
    const confirmed = await showConfirm(
      r.kind === "ai"
        ? `Delete the AI order for "${r.customerName}" (${shortId(r.id)})? Cannot be undone.`
        : `Delete the service order for "${r.customerName}" (${r.data.serialNumber ?? shortId(r.id)})? This also removes its message thread — cannot be undone.`
    );
    if (!confirmed) return;
    await fetch(
      r.kind === "ai"
        ? `/api/admin/orders?id=${encodeURIComponent(r.id)}`
        : `/api/admin/repairs?id=${encodeURIComponent(r.id)}`,
      { method: "DELETE" }
    );
    if (openId === r.id) setOpenId(null);
    refresh();
  }

  useEffect(() => {
    refresh();
    fetch(`/api/admin/tags?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { tags: Tag[] }) => setTagCatalog(d.tags));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // This panel has no "active" signal from the parent (every dashboard
  // tab stays mounted, hidden via CSS) -- poll unconditionally so an
  // item added/removed elsewhere (or stock consumed) shows up here
  // without a manual reload. refresh() never blanks state first, so
  // this is a silent update, not a loading flash.
  useEffect(() => {
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
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
        body: JSON.stringify({
          businessId,
          ...form,
          items: draftItems.map((i) => ({
            kind: i.kind,
            productId: i.productId,
            name: i.name,
            quantity: Number(i.quantity) || 1,
            defaultPrice: Number(i.price) || 0,
            costPrice: i.costPrice ? Number(i.costPrice) || undefined : undefined,
          })),
        }),
      });
      if (res.ok) {
        setForm({ customerName: "", phone: "", email: "", deviceType: "", deviceModel: "", issueDescription: "", isWalkIn: false });
        setDraftItems([]);
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
    return [...ai, ...service];
  }, [aiOrders, serviceOrders]);

  // Fuzzy-ish: case-insensitive substring match across every field a
  // staff member would actually search by (name, phone, serial/ID,
  // device, products) -- no fuzzy-match library needed for this size.
  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;

    const result = rows.filter((r) => {
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
    // By order number (PRAZ00012 -> 12), highest first by default -- the
    // number only ever counts up, so it's the creation order without
    // depending on the date. Rows without one (AI-chat orders) fall back
    // to the date.
    const numOf = (r: (typeof rows)[number]): number | null => {
      const serial = r.kind === "service" ? r.data.serialNumber : undefined;
      const m = serial ? /(\d+)$/.exec(serial) : null;
      return m ? Number(m[1]) : null;
    };
    return result.sort((a, b) => {
      const na = numOf(a);
      const nb = numOf(b);
      const diff = na !== null && nb !== null ? na - nb : new Date(a.date).getTime() - new Date(b.date).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
  }, [rows, search, dateFrom, dateTo, sortOrder]);

  const loading = !aiOrders || !serviceOrders;

  const isRepair = businessType === "repair";
  
  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Orders</h2>
      <p style={subtleTextStyle}>
        {isRepair
          ? "Every repair order — booked through chat, by phone, or walk-in — in one place."
          : "Every order — taken by the AI directly in a chat, or a staff-managed service/repair job with itemized parts & services billed against Inventory and Invoices — in one place."}
      </p>

      <button onClick={() => setShowNew((s) => !s)} style={primaryButtonStyle}>
        {showNew ? "Cancel" : "+ New service order"}
      </button>

      {showNew && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Customer name *" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} style={{ padding: 8, flex: "1 1 180px", minWidth: 0 }} />
          <input placeholder="Phone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ padding: 8, flex: "1 1 150px", minWidth: 0 }} />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ padding: 8, flex: "1 1 180px", minWidth: 0 }} />
          <input placeholder="Device type *" value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value })} style={{ padding: 8, flex: "1 1 150px", minWidth: 0 }} />
          <input list="device-models" placeholder="Device model" value={form.deviceModel} onChange={(e) => setForm({ ...form, deviceModel: e.target.value })} style={{ padding: 8, flex: "1 1 150px", minWidth: 0 }} />
          <datalist id="device-models">
            {deviceModelOptions.map((m) => <option key={m} value={m} />)}
          </datalist>
          <input placeholder="Issue *" value={form.issueDescription} onChange={(e) => setForm({ ...form, issueDescription: e.target.value })} style={{ padding: 8, flex: 1, minWidth: 180 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={form.isWalkIn} onChange={(e) => setForm({ ...form, isWalkIn: e.target.checked })} />
            Walk-in
          </label>

          <div style={{ width: "100%", borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 4 }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 6 }}>Parts / services (optional — can also be added later)</div>
            {draftItems.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 13 }}>
                <span style={badgeStyle(item.kind === "part" ? "info" : "neutral")}>{item.kind}</span>
                <span style={{ flex: 1 }}>{item.name} × {item.quantity}</span>
                <strong>{currency}{(Number(item.price) || 0) * (Number(item.quantity) || 1)}</strong>
                <button onClick={() => removeDraftItem(i)} style={{ fontSize: 11, padding: "3px 6px" }}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <select value={newItemKind} onChange={(e) => setNewItemKind(e.target.value as "part" | "service")} style={{ padding: 6 }}>
                <option value="part">Part</option>
                <option value="service">Service</option>
              </select>
              {newItemKind === "part" ? (
                <>
                  <select value={newItemProductId} onChange={(e) => pickNewItemProduct(e.target.value)} style={{ padding: 6, minWidth: 160 }}>
                    <option value="">Custom part (not in Inventory)</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} {p.price ? `(${currency}${p.price})` : ""}</option>
                    ))}
                  </select>
                  <input placeholder="Part name" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} style={{ padding: 6, minWidth: 140 }} />
                </>
              ) : (
                <input placeholder="Service name" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} style={{ padding: 6, minWidth: 160 }} />
              )}
              <input placeholder="Qty" type="number" min={1} value={newItemQuantity} onChange={(e) => setNewItemQuantity(e.target.value)} style={{ padding: 6, width: 60 }} />
              <input placeholder="Price" type="number" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} style={{ padding: 6, width: 90 }} />
              {!newItemProductId && (
                <input
                  placeholder="Cost price (optional)"
                  type="number"
                  value={newItemCostPrice}
                  onChange={(e) => setNewItemCostPrice(e.target.value)}
                  title="What this part/service actually costs the business -- used for profit reporting, never shown to the customer. Leave blank if unknown."
                  style={{ padding: 6, width: 130 }}
                />
              )}
              <button onClick={addDraftItem} disabled={!newItemName.trim() || !newItemPrice.trim()} style={{ fontSize: 12, padding: "6px 10px" }}>
                + Add item
              </button>
            </div>
          </div>

          <button onClick={createOrder} disabled={saving} style={primaryButtonStyle}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="search"
          name="aiva-search-orders"
          autoComplete="off"
          style={{ padding: 8, flex: "1 1 200px", minWidth: 0, maxWidth: 320 }}
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
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")} style={{ padding: 8, fontSize: 12 }}>
          <option value="newest">Highest # first</option>
          <option value="oldest">Lowest # first</option>
        </select>
        {(search || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }} style={{ fontSize: 12, padding: "8px 12px" }}>
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
                    <td style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)" }}>
                      {r.kind === "service" ? r.data.serialNumber ?? shortId(r.id) : shortId(r.id)}
                    </td>
                    <td style={cellStyle}>{new Date(r.date).toLocaleString()}</td>
                    <td style={cellStyle}>{r.customerName}</td>
                    <td style={cellStyle}>{r.phone}</td>
                    <td style={cellStyle}>{r.detail}</td>
                    <td style={cellStyle}>{r.status}</td>
                    <td style={cellStyle}>{r.total !== null ? `${currency}${r.total}` : "—"}</td>
                    <td style={cellStyle}>
                      {r.kind === "ai" ? (
                        <MessageTagControl
                          catalog={tagCatalog}
                          applied={orderTags[r.id] ?? []}
                          onAssign={(tagId) => assignTag(r.id, tagId)}
                          onRemove={(tagId) => removeTag(r.id, tagId)}
                        />
                      ) : (
                        <button onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ fontSize: 12, padding: "6px 12px" }}>
                          {openId === r.id ? "Close" : "Open"}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => deleteRow(r)}
                          title="Delete order"
                          style={{ marginLeft: 8, width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", cursor: "pointer", color: "var(--text-faint)", fontFamily: "inherit" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger, #e5484d)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-faint)")}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                  {r.kind === "service" && openId === r.id && (
                    <tr>
                      <td colSpan={8} style={{ ...cellStyle, background: "var(--surface)" }}>
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
