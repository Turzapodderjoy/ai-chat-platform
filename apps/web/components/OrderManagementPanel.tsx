"use client";

import { useState } from "react";
import { subtleTextStyle, primaryButtonStyle, badgeStyle } from "./dashboard-styles";

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
  appointmentDate: string;
  status: string;
  serialNumber?: string;
  contactId?: string;
  items: OrderItem[];
}

export interface Product {
  id: string;
  name: string;
  price: string | null;
  stock: string | null;
}

export function orderTotal(order: RepairOrder): number {
  return order.items.reduce((sum, item) => sum + item.finalPrice, 0);
}

/** Shared parts/services billing sub-panel for one service/repair order --
 * rendered inline by the unified Orders panel (both for its own expanded
 * rows and for the Repairs panel's "Manage Order" button), so it isn't
 * built twice. Every write here goes through /api/admin/repairs/order-items,
 * which also adjusts real Inventory stock for part line-items (see
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
          <span style={{ color: "var(--text-faint)", textDecoration: item.overridePrice != null ? "line-through" : "none" }}>
            Initial: ৳{item.defaultPrice * item.quantity}
          </span>
          <input
            placeholder="Override total"
            defaultValue={item.overridePrice ?? ""}
            onChange={(e) => setOverrideDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
            onBlur={() => saveOverride(item.id)}
            style={{ width: 100, padding: 4, fontSize: 12 }}
          />
          {item.overridePrice != null && <span style={badgeStyle("warn")}>Overridden</span>}
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
