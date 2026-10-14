"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { dataStrongStyle, shortId } from "./dashboard-styles";
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

const REPAIR_LAMP: Record<string, string> = {
  booked: "lamp-idle",
  received: "lamp-info",
  in_repair: "lamp-info",
  ready: "lamp-ok",
  completed: "lamp-ok",
  cancelled: "lamp-err",
};

const REPAIR_LABEL: Record<string, string> = {
  booked: "Booked",
  received: "Received",
  in_repair: "In repair",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

function OrderStatusCell({ kind, status }: { kind: Row["kind"]; status: string }) {
  // A payment method is not a status, so chat orders get quiet text; only
  // a real repair status earns a lamp.
  if (kind === "ai") return <span className="meta">{status}</span>;
  return <span className={`lamp ${REPAIR_LAMP[status] ?? "lamp-idle"}`}>{REPAIR_LABEL[status] ?? status}</span>;
}


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
    <section className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-head" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span className="instrument-label">Orders</span>
          <div className="meta">
            {isRepair
              ? "Every repair order, booked through chat, by phone, or walk-in."
              : "Orders the assistant took in a chat alongside staff-managed repair jobs billed against Inventory."}
          </div>
        </div>
        <button type="button" className="primary sm" onClick={() => setShowNew((s) => !s)}>
          {showNew ? "Close new order" : "New service order"}
        </button>
      </div>

      <div className="panel-body">
        {showNew && (
          <div className="panel-sunk" style={{ padding: 14, marginBottom: 14 }}>
            <div className="instrument-label" style={{ marginBottom: 10 }}>New service order</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
              <div className="field">
                <label className="field-label" htmlFor="ord-customer">Customer name</label>
                <input
                  id="ord-customer"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="ord-phone">Phone</label>
                <input
                  id="ord-phone"
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="ord-email">Email</label>
                <input
                  id="ord-email"
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="ord-device-type">Device type</label>
                <input
                  id="ord-device-type"
                  value={form.deviceType}
                  onChange={(e) => setForm({ ...form, deviceType: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="ord-device-model">Device model</label>
                <input
                  id="ord-device-model"
                  list="device-models"
                  value={form.deviceModel}
                  onChange={(e) => setForm({ ...form, deviceModel: e.target.value })}
                />
                <datalist id="device-models">
                  {deviceModelOptions.map((m) => <option key={m} value={m} />)}
                </datalist>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label className="field-label" htmlFor="ord-issue">Issue</label>
                <input
                  id="ord-issue"
                  value={form.issueDescription}
                  onChange={(e) => setForm({ ...form, issueDescription: e.target.value })}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink-2)" }}>
                  <input type="checkbox" checked={form.isWalkIn} onChange={(e) => setForm({ ...form, isWalkIn: e.target.checked })} />
                  Customer walked in
                </label>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
              <div className="instrument-label" style={{ marginBottom: 4 }}>Parts and services</div>
              <div className="field-hint" style={{ marginBottom: 8 }}>
                Optional. They can also be added to the order later.
              </div>

              {draftItems.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, fontSize: 13 }}>
                  <span className="meta" style={{ minWidth: 52 }}>{item.kind === "part" ? "Part" : "Service"}</span>
                  <span style={{ flex: 1 }}>{item.name}</span>
                  <span className="data" style={{ color: "var(--ink-3)" }}>× {item.quantity}</span>
                  <span className="data" style={dataStrongStyle}>
                    {currency}{(Number(item.price) || 0) * (Number(item.quantity) || 1)}
                  </span>
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => removeDraftItem(i)}
                    aria-label={`Remove ${item.name}`}
                    title={`Remove ${item.name}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                  </button>
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field" style={{ width: 116, flex: "0 0 116px" }}>
                  <label className="field-label" htmlFor="ord-item-kind">Kind</label>
                  <select
                    id="ord-item-kind"
                    value={newItemKind}
                    onChange={(e) => setNewItemKind(e.target.value as "part" | "service")}
                  >
                    <option value="part">Part</option>
                    <option value="service">Service</option>
                  </select>
                </div>
                {newItemKind === "part" && (
                  <div className="field" style={{ flex: "1 1 180px", minWidth: 0 }}>
                    <label className="field-label" htmlFor="ord-item-product">Inventory part</label>
                    <select id="ord-item-product" value={newItemProductId} onChange={(e) => pickNewItemProduct(e.target.value)}>
                      <option value="">Custom part, not in Inventory</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.price ? ` (${currency}${p.price})` : ""}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field" style={{ flex: "1 1 150px", minWidth: 0 }}>
                  <label className="field-label" htmlFor="ord-item-name">{newItemKind === "part" ? "Part name" : "Service name"}</label>
                  <input
                    id="ord-item-name"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                  />
                </div>
                <div className="field" style={{ width: 76, flex: "0 0 76px" }}>
                  <label className="field-label" htmlFor="ord-item-qty">Qty</label>
                  <input
                    id="ord-item-qty"
                    className="data"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={newItemQuantity}
                    onChange={(e) => setNewItemQuantity(e.target.value)}
                  />
                </div>
                <div className="field" style={{ width: 104, flex: "0 0 104px" }}>
                  <label className="field-label" htmlFor="ord-item-price">Price</label>
                  <input
                    id="ord-item-price"
                    className="data"
                    type="number"
                    inputMode="decimal"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                  />
                </div>
                {!newItemProductId && (
                  <div className="field" style={{ width: 150, flex: "0 0 150px" }}>
                    <label className="field-label" htmlFor="ord-item-cost">Cost price</label>
                    <input
                      id="ord-item-cost"
                      className="data"
                      type="number"
                      inputMode="decimal"
                      value={newItemCostPrice}
                      onChange={(e) => setNewItemCostPrice(e.target.value)}
                    />
                    <div className="field-hint">Profit reporting only</div>
                  </div>
                )}
                <button
                  type="button"
                  className="sm"
                  onClick={addDraftItem}
                  disabled={!newItemName.trim() || !newItemPrice.trim()}
                >
                  Add item
                </button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button type="button" className="primary" onClick={createOrder} disabled={saving}>
                {saving ? "Saving order" : "Save service order"}
              </button>
            </div>
          </div>
        )}

        <div className="toolbar">
          <div className="field" style={{ flex: "1 1 200px", maxWidth: 320, minWidth: 0 }}>
            <label className="field-label" htmlFor="ord-search">Search orders</label>
            <input
              id="ord-search"
              type="search"
              name="aiva-search-orders"
              autoComplete="off"
              placeholder="Name, phone, order ID, device"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <label className="field-label" htmlFor="ord-from">From</label>
            <input id="ord-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <label className="field-label" htmlFor="ord-to">To</label>
            <input id="ord-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <label className="field-label" htmlFor="ord-sort">Sort</label>
            <select id="ord-sort" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}>
              <option value="newest">Highest order number</option>
              <option value="oldest">Lowest order number</option>
            </select>
          </div>
          {(search || dateFrom || dateTo) && (
            <button
              type="button"
              className="ghost sm"
              style={{ alignSelf: "flex-end" }}
              onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}
            >
              Clear filters
            </button>
          )}
        </div>

        {loading && <p className="meta">Loading orders</p>}

        {!loading && rows && rows.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-title">No orders yet</span>
            <span className="empty-state-description">
              Add a service order above, or let the assistant take one in a chat.
            </span>
          </div>
        )}

        {!loading && filtered?.length === 0 && rows && rows.length > 0 && (
          <div className="empty-state">
            <span className="empty-state-title">Nothing matches those filters</span>
            <span className="empty-state-description">
              Widen the date range or clear the search box to see all {rows.length} orders.
            </span>
          </div>
        )}

        {filtered && filtered.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Detail</th>
                  <th>Status / Payment</th>
                  <th className="num" style={{ textAlign: "right" }}>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="data" style={{ color: "var(--ink)", fontWeight: 600 }}>
                        {r.kind === "service" ? r.data.serialNumber ?? shortId(r.id) : shortId(r.id)}
                      </td>
                      <td className="data" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{new Date(r.date).toLocaleString()}</td>
                      <td style={{ color: "var(--ink)" }}>{r.customerName}</td>
                      <td className="data" style={{ fontSize: 12 }}>{r.phone}</td>
                      <td>{r.detail}</td>
                      <td><OrderStatusCell kind={r.kind} status={r.status} /></td>
                      <td className="num" style={{ textAlign: "right", color: "var(--ink)", fontWeight: 600 }}>
                        {r.total !== null ? `${currency}${r.total}` : <span className="meta">Not billed</span>}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {r.kind === "ai" ? (
                            <MessageTagControl
                              catalog={tagCatalog}
                              applied={orderTags[r.id] ?? []}
                              onAssign={(tagId) => assignTag(r.id, tagId)}
                              onRemove={(tagId) => removeTag(r.id, tagId)}
                            />
                          ) : (
                            <button
                              type="button"
                              className="sm"
                              onClick={() => setOpenId(openId === r.id ? null : r.id)}
                              aria-expanded={openId === r.id}
                            >
                              {openId === r.id ? "Close" : "Open"}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="ghost sm"
                              onClick={() => deleteRow(r)}
                              aria-label={`Delete order for ${r.customerName}`}
                              title="Delete order"
                              style={{ color: "var(--danger)" }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {r.kind === "service" && openId === r.id && (
                      <tr>
                        <td colSpan={8} style={{ background: "var(--panel-sunk)", padding: 14 }}>
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
      </div>
    </section>
  );
}