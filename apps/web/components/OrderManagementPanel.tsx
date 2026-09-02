"use client";

import { useEffect, useState } from "react";
import { cardStyle, subtleTextStyle, primaryButtonStyle, badgeStyle } from "./dashboard-styles";

interface OrderItem {
  id: string;
  repairAppointmentId: string;
  productId?: string;
  kind: "part" | "service";
  name: string;
  quantity: number;
  defaultPrice: number;
  overridePrice?: number;
  finalPrice: number;
}

export interface RepairOrder {
  id: string;
  businessId: string;
  trackingToken: string;
  customerName: string;
  phone: string;
  email?: string;
  deviceType: string;
  deviceModel?: string;
  issueDescription: string;
  status: string;
  serialNumber?: string;
  contactId?: string;
  items: OrderItem[];
}

interface Product {
  id: string;
  name: string;
  price: string | null;
  stock: string | null;
}

function orderTotal(order: RepairOrder): number {
  return order.items.reduce((sum, item) => sum + item.finalPrice, 0);
}

/** Shared parts/services billing sub-panel for one repair order --
 * rendered both by this page (Order Management) and inline by
 * RepairsPanel's "Manage Order" button, so it isn't built twice. Every
 * write here goes through /api/admin/repairs/order-items, which also
 * adjusts real Inventory stock for part line-items (see
 * RepairAppointmentService.addItem/removeItem). */
export function OrderItemsEditor({ order, products, onChanged }: { order: RepairOrder; products: Product[]; onChanged: () => void }) {
  const [kind, setKind] = useState<"part" | "service">("part");
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, string>>({});

  function pickProduct(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) {
      setName(p.name);
      setPrice(p.price ?? "0");
    }
  }

  async function addItem() {
    if (!name.trim() || !price.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/admin/repairs/order-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repairAppointmentId: order.id,
          kind,
          productId: kind === "part" && productId ? productId : undefined,
          name,
          quantity: Number(quantity) || 1,
          defaultPrice: Number(price) || 0,
        }),
      });
      setProductId("");
      setName("");
      setQuantity("1");
      setPrice("");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(itemId: string) {
    await fetch(`/api/admin/repairs/order-items?id=${encodeURIComponent(itemId)}`, { method: "DELETE" });
    onChanged();
  }

  async function saveOverride(itemId: string) {
    const raw = overrideDrafts[itemId];
    const overridePrice = raw?.trim() ? Number(raw) : null;
    await fetch("/api/admin/repairs/order-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, overridePrice }),
    });
    onChanged();
  }

  async function generateInvoice() {
    const res = await fetch(`/api/admin/repairs/${order.id}/invoice`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      alert(`Couldn't generate invoice: ${data.error ?? "unknown error"}`);
      return;
    }
    alert(`Invoice ${data.invoiceNumber} generated.`);
    onChanged();
  }

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      {order.items.length === 0 && <p style={subtleTextStyle}>No parts or services added yet.</p>}
      {order.items.map((item) => (
        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13 }}>
          <span style={badgeStyle(item.kind === "part" ? "info" : "neutral")}>{item.kind}</span>
          <span style={{ flex: 1 }}>{item.name} × {item.quantity}</span>
          <span>৳{item.defaultPrice * item.quantity}</span>
          <input
            placeholder="Override total"
            defaultValue={item.overridePrice ?? ""}
            onChange={(e) => setOverrideDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
            onBlur={() => saveOverride(item.id)}
            style={{ width: 100, padding: 4, fontSize: 12 }}
          />
          <strong style={{ width: 70, textAlign: "right" }}>৳{item.finalPrice}</strong>
          <button onClick={() => removeItem(item.id)} style={{ fontSize: 11, padding: "3px 6px" }}>✕</button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as "part" | "service")} style={{ padding: 6 }}>
          <option value="part">Part</option>
          <option value="service">Service</option>
        </select>
        {kind === "part" ? (
          <select value={productId} onChange={(e) => pickProduct(e.target.value)} style={{ padding: 6, minWidth: 160 }}>
            <option value="">Pick inventory item…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} {p.price ? `(৳${p.price})` : ""}</option>
            ))}
          </select>
        ) : (
          <input placeholder="Service name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 6, minWidth: 160 }} />
        )}
        <input placeholder="Qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ padding: 6, width: 60 }} />
        <input placeholder="Price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={{ padding: 6, width: 90 }} />
        <button onClick={addItem} disabled={saving || !name.trim() || !price.trim()} style={{ fontSize: 12, padding: "6px 10px" }}>
          + Add
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <strong>Total: ৳{orderTotal(order)}</strong>
        <button onClick={generateInvoice} disabled={order.items.length === 0} style={primaryButtonStyle}>
          Generate Invoice
        </button>
      </div>
    </div>
  );
}

/** Repair-type-clients-only dashboard tab. One row per RepairAppointment
 * ("order") -- serial number, customer, device, status, running total --
 * expandable to the shared OrderItemsEditor above. New entries can also
 * come from a chat (AllChatsPanel) or from the Repairs panel's own
 * "Manage Order" button on an existing appointment; this page's own
 * "+ New" is the third entry point. */
export function OrderManagementPanel({ businessId }: { businessId: string }) {
  const [orders, setOrders] = useState<RepairOrder[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ customerName: "", phone: "", email: "", deviceType: "", deviceModel: "", issueDescription: "" });
  const [saving, setSaving] = useState(false);
  const [deviceModelOptions, setDeviceModelOptions] = useState<string[]>([]);

  function refresh() {
    fetch(`/api/admin/repairs?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { appointments: RepairOrder[] }) => {
        setOrders(d.appointments);
        // Device-model dropdown auto-grows from real history -- no
        // separate managed catalog (see this feature's design notes).
        setDeviceModelOptions([...new Set(d.appointments.map((a) => a.deviceModel).filter((x): x is string => !!x))]);
      });
    fetch(`/api/admin/products?businessId=${encodeURIComponent(businessId)}&limit=200`)
      .then((r) => r.json())
      .then((d: { products: Product[] }) => setProducts(d.products));
  }

  useEffect(refresh, [businessId]);

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

  if (!orders) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Order Management</h2>
      <p style={subtleTextStyle}>
        Parts and services billing for repair jobs — wired to Inventory (stock decrements as parts are used) and
        generates real Invoices.
      </p>

      <button onClick={() => setShowNew((s) => !s)} style={primaryButtonStyle}>
        {showNew ? "Cancel" : "+ New order"}
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

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {orders.length === 0 && <p style={subtleTextStyle}>No orders yet.</p>}
        {orders.map((order) => (
          <div key={order.id} style={{ ...cardStyle, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{order.serialNumber ?? "—"}</strong>{" "}
                <span style={{ marginLeft: 8 }}>{order.customerName}</span>{" "}
                <span style={{ ...subtleTextStyle, marginLeft: 8 }}>{order.deviceType}{order.deviceModel ? ` (${order.deviceModel})` : ""}</span>
                <span style={{ marginLeft: 8 }}><span style={badgeStyle("neutral")}>{order.status}</span></span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong>৳{orderTotal(order)}</strong>
                <button onClick={() => setOpenId(openId === order.id ? null : order.id)} style={{ fontSize: 12, padding: "4px 10px" }}>
                  {openId === order.id ? "Close" : "Open"}
                </button>
              </div>
            </div>
            {openId === order.id && <OrderItemsEditor order={order} products={products} onChanged={refresh} />}
          </div>
        ))}
      </div>
    </section>
  );
}
